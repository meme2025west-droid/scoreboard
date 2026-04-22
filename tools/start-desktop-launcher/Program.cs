using System.Diagnostics;

var rootDir = AppContext.BaseDirectory;
var batchPath = Path.Combine(rootDir, "start-desktop.bat");

if (!File.Exists(batchPath))
{
    Console.Error.WriteLine($"Could not find start-desktop.bat next to this exe: {batchPath}");
    return 1;
}

var process = Process.Start(new ProcessStartInfo
{
    FileName = "cmd.exe",
    Arguments = $"/c \"{batchPath}\"",
    WorkingDirectory = rootDir,
    UseShellExecute = false,
    CreateNoWindow = true,
    WindowStyle = ProcessWindowStyle.Hidden,
});

if (process is null)
{
    Console.Error.WriteLine("Failed to start start-desktop.bat");
    return 1;
}

process.WaitForExit();
return process.ExitCode;
