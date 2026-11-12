param(
  [ValidateSet('get', 'set', 'mute', 'list')]
  [string]$Action = 'get',
  [string]$AppHint = '',
  [int]$Volume = -1,
  [string]$Muted = ''
)

$code = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class AppAudioVolume {
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

  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr AudioSessionGuid, int StreamFlags, out IntPtr SessionControl);
    int GetSimpleAudioVolume(IntPtr AudioSessionGuid, int StreamFlags, out IntPtr AudioVolume);
    int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
  }

  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionEnumerator {
    int GetCount(out int SessionCount);
    int GetSession(int SessionCount, out IAudioSessionControl Session);
  }

  [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionControl {
    int GetState(out int pRetVal);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetGroupingParam(out Guid pRetVal);
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
  }

  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IAudioSessionControl2 {
    // IAudioSessionControl methods
    int GetState(out int pRetVal);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
    int GetGroupingParam(out Guid pRetVal);
    int SetGroupingParam(ref Guid Override, ref Guid EventContext);
    int RegisterAudioSessionNotification(IntPtr NewNotifications);
    int UnregisterAudioSessionNotification(IntPtr NewNotifications);
    // IAudioSessionControl2 methods
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
    int GetProcessId(out uint pRetVal);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
  }

  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface ISimpleAudioVolume {
    int SetMasterVolume(float fLevel, ref Guid EventContext);
    int GetMasterVolume(out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid EventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
  }

  public class SessionInfo {
    public uint Pid;
    public string ProcessName;
    public string DisplayName;
    public int State;
    public int Volume;
    public bool Muted;
  }

  private static List<SessionInfo> ProcessSessions(string appHint, bool doSetVol, float targetVol, bool doSetMute, bool targetMute) {
    var results = new List<SessionInfo>();
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
    IMMDevice device = null;
    // eRender = 0, eMultimedia = 1
    if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0 || device == null) return results;

    Guid iidMgr = typeof(IAudioSessionManager2).GUID;
    object mgrObj = null;
    if (device.Activate(ref iidMgr, 23, IntPtr.Zero, out mgrObj) != 0 || mgrObj == null) return results;

    var mgr = (IAudioSessionManager2)mgrObj;
    IAudioSessionEnumerator sessionEnum = null;
    if (mgr.GetSessionEnumerator(out sessionEnum) != 0 || sessionEnum == null) return results;

    int count = 0;
    sessionEnum.GetCount(out count);
    Guid ctx = Guid.Empty;
    string hint = (appHint ?? "").ToLowerInvariant();

    for (int i = 0; i < count; i++) {
      IAudioSessionControl ctrl = null;
      if (sessionEnum.GetSession(i, out ctrl) != 0 || ctrl == null) continue;
      var ctrl2 = ctrl as IAudioSessionControl2;
      var volCtrl = ctrl as ISimpleAudioVolume;
      if (ctrl2 == null || volCtrl == null) continue;

      if (ctrl2.IsSystemSoundsSession() == 0) continue; // skip system sounds

      uint pid = 0;
      ctrl2.GetProcessId(out pid);
      string procName = "";
      try {
        if (pid > 0) procName = Process.GetProcessById((int)pid).ProcessName;
      } catch {}

      string dispName = "";
      try { ctrl2.GetDisplayName(out dispName); } catch {}

      int state = 0;
      try { ctrl2.GetState(out state); } catch {}

      bool matches = string.IsNullOrEmpty(hint);
      if (!matches) {
        string pLow = (procName ?? "").ToLowerInvariant();
        string dLow = (dispName ?? "").ToLowerInvariant();
        if (!string.IsNullOrEmpty(pLow) && (hint.Contains(pLow) || pLow.Contains(hint))) matches = true;
        else if (!string.IsNullOrEmpty(dLow) && (hint.Contains(dLow) || dLow.Contains(hint))) matches = true;
        else if (hint.Contains("youtube") && (pLow == "chrome" || pLow == "msedge" || pLow == "brave" || pLow == "firefox")) matches = true;
        else if (hint.Contains("apple") && pLow.Contains("applemusic")) matches = true;
      }

      if (!matches) continue;

      if (doSetVol) {
        volCtrl.SetMasterVolume(targetVol, ref ctx);
      }
      if (doSetMute) {
        volCtrl.SetMute(targetMute, ref ctx);
      }

      float level = 1.0f;
      bool muted = false;
      volCtrl.GetMasterVolume(out level);
      volCtrl.GetMute(out muted);

      results.Add(new SessionInfo {
        Pid = pid,
        ProcessName = procName ?? "",
        DisplayName = dispName ?? "",
        State = state,
        Volume = (int)Math.Round(level * 100.0f),
        Muted = muted
      });
    }
    return results;
  }

  public static List<SessionInfo> Run(string action, string appHint, int volume, bool hasMute, bool muteVal) {
    bool setVol = (action == "set" && volume >= 0 && volume <= 100);
    bool setMute = (action == "mute" && hasMute);
    float fVol = setVol ? (volume / 100.0f) : 0.0f;
    return ProcessSessions(appHint, setVol, fVol, setMute, muteVal);
  }
}
"@

Add-Type -TypeDefinition $code -Language CSharp

$hasMute = ($Muted -eq 'true' -or $Muted -eq 'false')
$muteVal = ($Muted -eq 'true')
$sessions = [AppAudioVolume]::Run($Action, $AppHint, $Volume, $hasMute, $muteVal)

if ($Action -eq 'list') {
  $sessions | ConvertTo-Json -Compress
} elseif ($sessions.Count -gt 0) {
  # Prefer active state (1) over inactive (0)
  $chosen = $sessions | Where-Object { $_.State -eq 1 } | Select-Object -First 1
  if (-not $chosen) { $chosen = $sessions[0] }
  @{
    ok = $true
    supported = $true
    app = $chosen.ProcessName
    volume = $chosen.Volume
    muted = $chosen.Muted
    matchedCount = $sessions.Count
  } | ConvertTo-Json -Compress
} else {
  @{
    ok = $true
    supported = $false
    reason = "No active Windows audio session matched '$AppHint'"
  } | ConvertTo-Json -Compress
}

