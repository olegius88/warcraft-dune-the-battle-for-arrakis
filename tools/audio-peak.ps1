# Sound check without listening: the peak level (0..1) of the audio sessions of a process, sampled
# -Seconds long every -EveryMs (Windows Core Audio: IAudioSessionManager2 -> sessions of the default
# render device -> IAudioMeterInformation.GetPeakValue). A session that plays shows peaks > 0.
# Usage: pwsh tools/audio-peak.ps1 [-Process 'Warcraft III'] [-Seconds 10] [-EveryMs 250]
param([string]$Process = 'Warcraft III', [int]$Seconds = 10, [int]$EveryMs = 250)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace AudioPeak {
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device); }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 { int NotImpl1(); int NotImpl2(); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int NotImpl0(); int NotImpl1(); int NotImpl2(); int NotImpl3(); int NotImpl4(); int NotImpl5(); int NotImpl6(); int NotImpl7(); int NotImpl8();
    int NotImpl9(); int NotImpl10(); [PreserveSig] int GetProcessId(out uint pid);
  }
  [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation { [PreserveSig] int GetPeakValue(out float peak); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  public static class Meter {
    /** Highest peak among the sessions of the process, -1 when it has none. */
    public static float Peak(uint pid) {
      var en = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice dev; Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
      var iid = typeof(IAudioSessionManager2).GUID; object o;
      Marshal.ThrowExceptionForHR(dev.Activate(ref iid, 23, IntPtr.Zero, out o));
      IAudioSessionEnumerator se; Marshal.ThrowExceptionForHR(((IAudioSessionManager2)o).GetSessionEnumerator(out se));
      int n; se.GetCount(out n);
      float best = -1;
      for (int i = 0; i < n; i++) {
        IAudioSessionControl2 s; se.GetSession(i, out s);
        uint p; s.GetProcessId(out p);
        if (p != pid) continue;
        float v; ((IAudioMeterInformation)s).GetPeakValue(out v);
        if (v > best) best = v;
      }
      return best;
    }
  }
}
'@
$p = Get-Process $Process -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { "no process $Process"; exit 1 }
$max = -1.0; $playing = 0; $n = 0
$until = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $until) {
  $v = [AudioPeak.Meter]::Peak([uint32]$p.Id)
  if ($v -gt $max) { $max = $v }
  if ($v -gt 0.001) { $playing++ }
  $n++
  Start-Sleep -Milliseconds $EveryMs
}
'peak {0:n3}, sound in {1} of {2} samples' -f $max, $playing, $n
