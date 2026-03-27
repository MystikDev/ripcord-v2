use serde::Serialize;
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;

/// Represents an audio device (input or output).
#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Audio device direction.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DeviceDirection {
    Input,
    Output,
}

/// Initialize COM for the current thread. Must be called once per thread that uses audio.
pub fn init_com() {
    unsafe {
        // COINIT_APARTMENTTHREADED is needed for WASAPI on the audio thread.
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    }
}

/// Enumerate audio devices of the given direction.
pub fn enumerate(direction: DeviceDirection) -> Vec<AudioDevice> {
    let mut devices = Vec::new();

    let flow = match direction {
        DeviceDirection::Input => eCapture,
        DeviceDirection::Output => eRender,
    };

    unsafe {
        let enumerator: IMMDeviceEnumerator =
            match CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) {
                Ok(e) => e,
                Err(_) => return devices,
            };

        // Get default device ID for comparison
        let default_id = enumerator
            .GetDefaultAudioEndpoint(flow, eConsole)
            .ok()
            .and_then(|d| d.GetId().ok())
            .map(|id| {
                let s = id.to_string().unwrap_or_default();
                CoTaskMemFree(Some(id.0 as *const _));
                s
            })
            .unwrap_or_default();

        // Enumerate all active devices
        let collection = match enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE) {
            Ok(c) => c,
            Err(_) => return devices,
        };

        let count = match collection.GetCount() {
            Ok(c) => c,
            Err(_) => return devices,
        };

        for i in 0..count {
            let device = match collection.Item(i) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let id = match device.GetId() {
                Ok(id) => {
                    let s = id.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(id.0 as *const _));
                    s
                }
                Err(_) => continue,
            };

            let name = get_device_name(&device).unwrap_or_else(|| format!("Device {i}"));
            let is_default = id == default_id;

            devices.push(AudioDevice {
                id,
                name,
                is_default,
            });
        }
    }

    devices
}

/// Get the friendly name of a device from its property store.
fn get_device_name(device: &IMMDevice) -> Option<String> {
    unsafe {
        let stgm = windows::Win32::System::Com::STGM(0); // STGM_READ = 0
        let store = device.OpenPropertyStore(stgm).ok()?;
        let value = store.GetValue(&PKEY_Device_FriendlyName).ok()?;

        // PROPVARIANT implements Display for string types
        let name = value.to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
}

/// Get a device by its ID string.
pub fn get_device_by_id(id: &str, direction: DeviceDirection) -> Option<IMMDevice> {
    let flow = match direction {
        DeviceDirection::Input => eCapture,
        DeviceDirection::Output => eRender,
    };

    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;

        if id.is_empty() || id == "default" {
            enumerator.GetDefaultAudioEndpoint(flow, eConsole).ok()
        } else {
            let wide: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
            let pwstr = windows::core::PCWSTR(wide.as_ptr());
            enumerator.GetDevice(pwstr).ok()
        }
    }
}
