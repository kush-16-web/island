$code = @"
using System;
using System.Runtime.InteropServices;

public class AudioMeter {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  private class MMDeviceEnumerator {}

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }

  [ComImport, Guid("C026162F-A459-4E45-A1E4-56E10BE0482B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioMeterInformation {
    int GetPeakValue(out float pfPeak);
  }

  public static float GetMasterPeak() {
    try {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
      IMMDevice device;
      enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      if (device == null) return -1f;
      Guid iid = new Guid("C026162F-A459-4E45-A1E4-56E10BE0482B");
      object meterObj;
      device.Activate(ref iid, 1, IntPtr.Zero, out meterObj);
      var meter = (IAudioMeterInformation)meterObj;
      float peak;
      meter.GetPeakValue(out peak);
      return peak;
    } catch {
      return -2f;
    }
  }
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[AudioMeter]::GetMasterPeak()
