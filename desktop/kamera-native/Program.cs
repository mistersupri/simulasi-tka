using System.Globalization;
using System.Text;
using System.Text.Json;
using Windows.Devices.Enumeration;
using Windows.Graphics.Imaging;
using Windows.Media.Capture;
using Windows.Media.Capture.Frames;
using Windows.Media.MediaProperties;
using Windows.Storage.Streams;

namespace KameraNative;

/// <summary>
/// Kamera native untuk aplikasi Ujian TKA.
///   kamera-native --daftar
///       JSON [{"id": "...", "nama": "..."}] di stdout.
///   kamera-native --kamera &lt;id&gt; [--lebar 640] [--fps 8] [--kualitas 0.7]
///       Aliran JPEG di stdout: [panjang int32 little-endian][byte JPEG], berulang.
///       Berhenti saat stdin ditutup (aplikasi induk keluar).
/// Galat ditulis ke stderr sebagai baris "GALAT:&lt;NamaGalat&gt;:&lt;pesan&gt;" (nama mengikuti DOMException
/// getUserMedia: NotAllowedError, NotFoundError, NotReadableError, AbortError), kode keluar 2.
/// </summary>
internal static class Program
{
    private static readonly object KunciTulis = new();
    private static Stream? keluaran;

    private static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Contains("--daftar"))
            {
                await Daftar();
                return 0;
            }
            var id = Ambil(args, "--kamera");
            if (string.IsNullOrEmpty(id))
            {
                Galat("TypeError", "Argumen --kamera wajib diisi.");
                return 2;
            }
            var lebar = int.TryParse(Ambil(args, "--lebar"), out var l) ? Math.Clamp(l, 160, 1920) : 640;
            var fps = int.TryParse(Ambil(args, "--fps"), out var f) ? Math.Clamp(f, 1, 30) : 8;
            var kualitas = double.TryParse(Ambil(args, "--kualitas"), NumberStyles.Float, CultureInfo.InvariantCulture, out var q)
                ? Math.Clamp(q, 0.1, 1.0) : 0.7;
            return await Rekam(id, lebar, fps, kualitas);
        }
        catch (Exception e)
        {
            Galat(NamaGalat(e), Pesan(e));
            return 2;
        }
    }

    private static string? Ambil(string[] args, string nama)
    {
        var i = Array.IndexOf(args, nama);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }

    private static void Galat(string nama, string pesan) =>
        Console.Error.WriteLine($"GALAT:{nama}:{pesan.ReplaceLineEndings(" ")}");

    private static string NamaGalat(Exception e) =>
        e is UnauthorizedAccessException ? "NotAllowedError" : "NotReadableError";

    private static string Pesan(Exception e) => $"{e.Message} (0x{e.HResult:X8})";

    private static async Task Daftar()
    {
        var perangkat = await DeviceInformation.FindAllAsync(DeviceClass.VideoCapture);
        var daftar = perangkat.Where(d => d.IsEnabled).Select(d => new Dictionary<string, string> { ["id"] = d.Id, ["nama"] = d.Name }).ToList();
        Console.Out.Write(JsonSerializer.Serialize(daftar));
        Console.Out.Flush();
    }

    /// <summary>Kontrol penuh dulu (bisa memilih resolusi); bila kamera sedang dikuasai aplikasi lain, baca bersama.</summary>
    private static async Task<(MediaCapture capture, bool eksklusif)> Buka(string id)
    {
        Exception? galatPertama = null;
        foreach (var mode in new[] { MediaCaptureSharingMode.ExclusiveControl, MediaCaptureSharingMode.SharedReadOnly })
        {
            var capture = new MediaCapture();
            try
            {
                await capture.InitializeAsync(new MediaCaptureInitializationSettings
                {
                    VideoDeviceId = id,
                    StreamingCaptureMode = StreamingCaptureMode.Video,
                    MemoryPreference = MediaCaptureMemoryPreference.Cpu,
                    SharingMode = mode,
                });
                return (capture, mode == MediaCaptureSharingMode.ExclusiveControl);
            }
            catch (UnauthorizedAccessException)
            {
                capture.Dispose();
                throw; // izin kamera Windows ditolak: mode lain tidak akan menolong
            }
            catch (Exception e)
            {
                capture.Dispose();
                galatPertama ??= e;
            }
        }
        throw galatPertama!;
    }

    private static async Task<int> Rekam(string id, int lebar, int fps, double kualitas)
    {
        var perangkat = await DeviceInformation.FindAllAsync(DeviceClass.VideoCapture);
        if (!perangkat.Any(d => d.Id == id))
        {
            Galat("NotFoundError", "Kamera tidak ditemukan.");
            return 2;
        }

        var (capture, eksklusif) = await Buka(id);
        using var _capture = capture;
        var selesai = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        capture.Failed += (_, e) =>
        {
            Galat("NotReadableError", $"{e.Message} (0x{e.Code:X8})");
            selesai.TrySetResult(2);
        };

        var sumber = capture.FrameSources.Values
            .Where(s => s.Info.SourceKind == MediaFrameSourceKind.Color)
            .OrderBy(s => s.Info.MediaStreamType == MediaStreamType.VideoPreview ? 0 : s.Info.MediaStreamType == MediaStreamType.VideoRecord ? 1 : 2)
            .FirstOrDefault();
        if (sumber is null)
        {
            Galat("NotReadableError", "Kamera tidak menyediakan gambar berwarna.");
            return 2;
        }

        if (eksklusif)
        {
            // Resolusi terdekat dengan lebar yang diminta: lebih ringan untuk dikompresi.
            var format = sumber.SupportedFormats
                .Where(x => x.VideoFormat.Width >= 320)
                .OrderBy(x => Math.Abs((int)x.VideoFormat.Width - lebar))
                .ThenByDescending(x => x.FrameRate.Denominator == 0 ? 0 : (double)x.FrameRate.Numerator / x.FrameRate.Denominator)
                .FirstOrDefault();
            if (format is not null)
            {
                try { await sumber.SetFormatAsync(format); } catch { /* pakai format bawaan kamera */ }
            }
        }

        using var pembaca = await capture.CreateFrameReaderAsync(sumber, MediaEncodingSubtypes.Bgra8);
        pembaca.AcquisitionMode = MediaFrameReaderAcquisitionMode.Realtime;
        keluaran = Console.OpenStandardOutput();

        var jeda = TimeSpan.FromMilliseconds(1000.0 / fps);
        var terakhir = DateTime.MinValue;
        var sibuk = 0;
        var adaBingkai = false;

        pembaca.FrameArrived += async (r, _) =>
        {
            if (DateTime.UtcNow - terakhir < jeda) return;
            if (Interlocked.Exchange(ref sibuk, 1) == 1) return;
            try
            {
                using var bingkai = r.TryAcquireLatestFrame();
                var video = bingkai?.VideoMediaFrame;
                if (video is null) return;
                var bmp = video.SoftwareBitmap;
                SoftwareBitmap? salinan = null;
                if (bmp is null && video.Direct3DSurface is { } permukaan)
                {
                    salinan = await SoftwareBitmap.CreateCopyFromSurfaceAsync(permukaan, BitmapAlphaMode.Ignore);
                    bmp = salinan;
                }
                if (bmp is null) return;
                terakhir = DateTime.UtcNow;
                var jpeg = await KeJpeg(bmp, lebar, kualitas);
                salinan?.Dispose();
                Tulis(jpeg);
                adaBingkai = true;
            }
            catch (IOException)
            {
                selesai.TrySetResult(0); // aplikasi induk sudah menutup aliran
            }
            catch (Exception e)
            {
                Galat(NamaGalat(e), Pesan(e));
                selesai.TrySetResult(2);
            }
            finally
            {
                Interlocked.Exchange(ref sibuk, 0);
            }
        };

        var status = await pembaca.StartAsync();
        if (status != MediaFrameReaderStartStatus.Success)
        {
            Galat("NotReadableError", $"Kamera gagal dimulai: {status}.");
            return 2;
        }

        // Aplikasi induk keluar = stdin tertutup.
        _ = Task.Run(() =>
        {
            try
            {
                using var masuk = Console.OpenStandardInput();
                var buf = new byte[64];
                while (masuk.Read(buf, 0, buf.Length) > 0) { }
            }
            catch { /* abaikan */ }
            selesai.TrySetResult(0);
        });

        // Kamera terbuka tetapi tidak mengirim gambar sama sekali.
        _ = Task.Delay(TimeSpan.FromSeconds(15)).ContinueWith(_ =>
        {
            if (adaBingkai) return;
            Galat("AbortError", "Timeout: kamera tidak mengirim gambar dalam 15 detik");
            selesai.TrySetResult(2);
        });

        var kode = await selesai.Task;
        try { await pembaca.StopAsync(); } catch { /* abaikan */ }
        return kode;
    }

    private static async Task<byte[]> KeJpeg(SoftwareBitmap bmp, int lebar, double kualitas)
    {
        using var bgra = SoftwareBitmap.Convert(bmp, BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore);
        using var aliran = new InMemoryRandomAccessStream();
        var opsi = new BitmapPropertySet
        {
            { "ImageQuality", new BitmapTypedValue((float)kualitas, Windows.Foundation.PropertyType.Single) },
        };
        var enkoder = await BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, aliran, opsi);
        enkoder.SetSoftwareBitmap(bgra);
        if (bgra.PixelWidth > lebar)
        {
            enkoder.BitmapTransform.ScaledWidth = (uint)lebar;
            enkoder.BitmapTransform.ScaledHeight = (uint)Math.Max(1, Math.Round((double)bgra.PixelHeight * lebar / bgra.PixelWidth));
            enkoder.BitmapTransform.InterpolationMode = BitmapInterpolationMode.Linear;
        }
        await enkoder.FlushAsync();

        var hasil = new byte[aliran.Size];
        using var pembaca = new DataReader(aliran.GetInputStreamAt(0));
        await pembaca.LoadAsync((uint)aliran.Size);
        pembaca.ReadBytes(hasil);
        return hasil;
    }

    private static void Tulis(byte[] jpeg)
    {
        lock (KunciTulis)
        {
            keluaran!.Write(BitConverter.GetBytes(jpeg.Length), 0, 4);
            keluaran.Write(jpeg, 0, jpeg.Length);
            keluaran.Flush();
        }
    }
}
