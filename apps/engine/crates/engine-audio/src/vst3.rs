use serde::Serialize;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use vst3::Steinberg::{
    kResultOk, IPluginFactory, IPluginFactoryTrait, IPluginBaseTrait, PClassInfo,
};
use vst3::Steinberg::Vst::{
    IAudioProcessor, IAudioProcessorTrait, IComponent, IComponentTrait,
    IEditController, IEditControllerTrait,
    AudioBusBuffers, AudioBusBuffers__type0, ProcessData, ProcessSetup,
    ParameterInfo, kRootUnitId,
    MediaTypes_::kAudio, BusDirections_::{kInput, kOutput},
    SymbolicSampleSizes_::kSample32,
};
use vst3::{ComPtr, Interface};

/// Information about a loaded VST3 plugin.
#[derive(Debug, Clone, Serialize)]
pub struct Vst3PluginInfo {
    pub name: String,
    pub path: String,
    pub param_count: usize,
}

/// A parameter exposed by the plugin.
#[derive(Debug, Clone, Serialize)]
pub struct Vst3Param {
    pub id: u32,
    pub title: String,
    pub default_value: f64,
    pub value: f64,
}

/// A loaded and initialized VST3 plugin, ready for audio processing.
pub struct Vst3Plugin {
    pub info: Vst3PluginInfo,
    _lib: libloading::Library,
    component: ComPtr<IComponent>,
    processor: ComPtr<IAudioProcessor>,
    controller: Option<ComPtr<IEditController>>,
    sample_rate: f64,
    block_size: usize,
    active: bool,
    bypass: bool,
}

// Safety: VST3 plugins are designed to be used from a single thread (the audio thread).
// We ensure that processing only happens on the audio thread.
unsafe impl Send for Vst3Plugin {}

impl Vst3Plugin {
    /// Load a VST3 plugin from a `.vst3` bundle path.
    pub fn load(path: &Path, sample_rate: f64, block_size: usize) -> Result<Self, String> {
        // Find the actual DLL inside the .vst3 bundle
        let dll_path = find_vst3_dll(path)?;

        // Load the dynamic library
        let lib = unsafe { libloading::Library::new(&dll_path) }
            .map_err(|e| format!("Failed to load VST3 DLL: {e}"))?;

        // Get the factory entry point
        let get_factory: libloading::Symbol<unsafe extern "system" fn() -> *mut c_void> = unsafe {
            lib.get(b"GetPluginFactory")
                .map_err(|e| format!("GetPluginFactory not found: {e}"))?
        };

        let factory_ptr = unsafe { get_factory() };
        if factory_ptr.is_null() {
            return Err("GetPluginFactory returned null".into());
        }

        let factory: ComPtr<IPluginFactory> =
            unsafe { ComPtr::from_raw(factory_ptr as *mut _) }
                .ok_or("Failed to create factory ComPtr")?;

        // Get the first class info
        let mut class_info = PClassInfo {
            cid: [0; 16],
            cardinality: 0,
            category: [0; 32],
            name: [0; 64],
        };

        let hr = unsafe { factory.getClassInfo(0, &mut class_info) };
        if hr != kResultOk {
            return Err("Failed to get class info".into());
        }

        let name = cstr_to_string(&class_info.name);

        // Create the component instance via factory
        let mut component_ptr: *mut c_void = std::ptr::null_mut();
        let hr = unsafe {
            factory.createInstance(
                class_info.cid.as_ptr(),
                IComponent::IID.as_ptr() as *const i8,
                &mut component_ptr,
            )
        };
        if hr != kResultOk || component_ptr.is_null() {
            return Err("Failed to create IComponent".into());
        }

        let component: ComPtr<IComponent> =
            unsafe { ComPtr::from_raw(component_ptr as *mut _) }
                .ok_or("Failed to wrap IComponent")?;

        // Initialize the component
        let hr = unsafe { component.initialize(std::ptr::null_mut()) };
        if hr != kResultOk {
            return Err("IComponent::initialize failed".into());
        }

        // Query IAudioProcessor via cast
        let processor: ComPtr<IAudioProcessor> = component
            .cast::<IAudioProcessor>()
            .ok_or("Failed to query IAudioProcessor")?;

        // Query IEditController (optional — some plugins don't have it)
        let controller: Option<ComPtr<IEditController>> = component.cast::<IEditController>();

        let param_count = controller
            .as_ref()
            .map(|c| unsafe { c.getParameterCount() as usize })
            .unwrap_or(0);

        // Setup audio processing
        let mut setup = ProcessSetup {
            processMode: 0, // kRealtime
            symbolicSampleSize: kSample32 as i32,
            maxSamplesPerBlock: block_size as i32,
            sampleRate: sample_rate,
        };

        let hr = unsafe { processor.setupProcessing(&mut setup) };
        if hr != kResultOk {
            return Err("IAudioProcessor::setupProcessing failed".into());
        }

        // Activate audio buses
        unsafe {
            // Activate main audio input bus
            let _ = component.activateBus(kAudio, kInput, 0, 1);
            // Activate main audio output bus
            let _ = component.activateBus(kAudio, kOutput, 0, 1);
        }

        // Set active
        let hr = unsafe { component.setActive(1) };
        if hr != kResultOk {
            log::warn!("IComponent::setActive failed (non-fatal)");
        }

        // Start processing
        let hr = unsafe { processor.setProcessing(1) };
        if hr != kResultOk {
            log::warn!("IAudioProcessor::setProcessing failed (non-fatal)");
        }

        log::info!(
            "VST3 loaded: '{}' from {} ({} params)",
            name,
            path.display(),
            param_count
        );

        Ok(Self {
            info: Vst3PluginInfo {
                name,
                path: path.to_string_lossy().into(),
                param_count,
            },
            _lib: lib,
            component,
            processor,
            controller,
            sample_rate,
            block_size,
            active: true,
            bypass: false,
        })
    }

    /// Process a block of audio in-place (mono f32).
    /// Returns true if processing occurred, false if bypassed.
    pub fn process(&mut self, buffer: &mut [f32]) -> bool {
        if self.bypass || !self.active {
            return false;
        }

        let num_samples = buffer.len().min(self.block_size) as i32;

        // VST3 uses separate input/output buffer pointers.
        // For in-place processing, we use the same buffer for both.
        let mut channel_ptr = buffer.as_mut_ptr();
        let mut input_buffers = AudioBusBuffers {
            numChannels: 1,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: &mut channel_ptr,
            },
        };

        let mut output_channel_ptr = buffer.as_mut_ptr();
        let mut output_buffers = AudioBusBuffers {
            numChannels: 1,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: &mut output_channel_ptr,
            },
        };

        let mut data = ProcessData {
            processMode: 0, // kRealtime
            symbolicSampleSize: kSample32 as i32,
            numSamples: num_samples,
            numInputs: 1,
            numOutputs: 1,
            inputs: &mut input_buffers,
            outputs: &mut output_buffers,
            inputParameterChanges: std::ptr::null_mut(),
            outputParameterChanges: std::ptr::null_mut(),
            inputEvents: std::ptr::null_mut(),
            outputEvents: std::ptr::null_mut(),
            processContext: std::ptr::null_mut(),
        };

        let hr = unsafe { self.processor.process(&mut data) };
        hr == kResultOk
    }

    /// Get/set bypass state.
    pub fn set_bypass(&mut self, bypass: bool) {
        self.bypass = bypass;
    }

    pub fn is_bypassed(&self) -> bool {
        self.bypass
    }

    /// Enumerate all parameters.
    pub fn get_parameters(&self) -> Vec<Vst3Param> {
        let controller = match &self.controller {
            Some(c) => c,
            None => return Vec::new(),
        };

        let count = unsafe { controller.getParameterCount() as usize };
        let mut params = Vec::with_capacity(count);

        for i in 0..count {
            let mut info = ParameterInfo {
                id: 0,
                title: [0; 128],
                shortTitle: [0; 128],
                units: [0; 128],
                stepCount: 0,
                defaultNormalizedValue: 0.0,
                unitId: kRootUnitId,
                flags: 0,
            };

            let hr = unsafe { controller.getParameterInfo(i as i32, &mut info) };
            if hr != kResultOk {
                continue;
            }

            let title = wstr_to_string(&info.title);
            let value = unsafe { controller.getParamNormalized(info.id) };

            params.push(Vst3Param {
                id: info.id,
                title,
                default_value: info.defaultNormalizedValue,
                value,
            });
        }

        params
    }

    /// Set a parameter value (normalized 0.0 - 1.0).
    pub fn set_parameter(&self, param_id: u32, value: f64) -> bool {
        if let Some(ref controller) = self.controller {
            let hr = unsafe { controller.setParamNormalized(param_id, value) };
            hr == kResultOk
        } else {
            false
        }
    }

    /// Get a parameter value (normalized 0.0 - 1.0).
    pub fn get_parameter(&self, param_id: u32) -> f64 {
        if let Some(ref controller) = self.controller {
            unsafe { controller.getParamNormalized(param_id) }
        } else {
            0.0
        }
    }
}

impl Drop for Vst3Plugin {
    fn drop(&mut self) {
        unsafe {
            let _ = self.processor.setProcessing(0);
            let _ = self.component.setActive(0);
            let _ = self.component.terminate();
        }
        log::info!("VST3 unloaded: '{}'", self.info.name);
    }
}

/// A slot in the processing chain that may contain a VST3 plugin.
pub struct PluginSlot {
    pub plugin: Option<Vst3Plugin>,
    /// Crossfade buffer for glitch-free swap.
    crossfade_out: Vec<f32>,
    crossfade_remaining: usize,
}

impl PluginSlot {
    pub fn new() -> Self {
        Self {
            plugin: None,
            crossfade_out: Vec::new(),
            crossfade_remaining: 0,
        }
    }

    /// Load a plugin into this slot, crossfading from the old one.
    pub fn load(
        &mut self,
        path: &Path,
        sample_rate: f64,
        block_size: usize,
    ) -> Result<Vst3PluginInfo, String> {
        let new_plugin = Vst3Plugin::load(path, sample_rate, block_size)?;
        let info = new_plugin.info.clone();

        // If there was an old plugin, set up crossfade
        if self.plugin.is_some() {
            self.crossfade_remaining = block_size; // crossfade over one block
            self.crossfade_out = vec![0.0; block_size];
        }

        self.plugin = Some(new_plugin);
        Ok(info)
    }

    /// Unload the plugin from this slot.
    pub fn unload(&mut self) {
        self.plugin = None;
        self.crossfade_remaining = 0;
    }

    /// Process audio through this slot. No-op if empty.
    pub fn process(&mut self, buffer: &mut [f32]) {
        if let Some(ref mut plugin) = self.plugin {
            if self.crossfade_remaining > 0 {
                // During crossfade: blend old (dry) signal with new (wet)
                let fade_len = buffer.len().min(self.crossfade_remaining);
                let total = self.crossfade_remaining;

                // Save dry signal
                self.crossfade_out[..fade_len].copy_from_slice(&buffer[..fade_len]);

                // Process through new plugin
                plugin.process(buffer);

                // Crossfade: linearly blend from dry to wet
                for i in 0..fade_len {
                    let t = 1.0 - (self.crossfade_remaining - i) as f32 / total as f32;
                    buffer[i] = self.crossfade_out[i] * (1.0 - t) + buffer[i] * t;
                }

                self.crossfade_remaining = self.crossfade_remaining.saturating_sub(fade_len);
            } else {
                plugin.process(buffer);
            }
        }
    }

    pub fn is_loaded(&self) -> bool {
        self.plugin.is_some()
    }

    pub fn set_bypass(&mut self, bypass: bool) {
        if let Some(ref mut plugin) = self.plugin {
            plugin.set_bypass(bypass);
        }
    }
}

impl Default for PluginSlot {
    fn default() -> Self {
        Self::new()
    }
}

/// Maximum number of VST3 plugin slots in the chain.
pub const MAX_SLOTS: usize = 8;

/// Find the actual DLL inside a `.vst3` bundle directory.
fn find_vst3_dll(path: &Path) -> Result<PathBuf, String> {
    // .vst3 bundles on Windows have the structure:
    // MyPlugin.vst3/Contents/x86_64-win/MyPlugin.vst3
    // But some plugins are just a single .vst3 DLL file.

    if path.is_file() {
        return Ok(path.to_path_buf());
    }

    if path.is_dir() {
        // Look for the DLL in the standard bundle location
        let x64_dir = path.join("Contents").join("x86_64-win");
        if x64_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&x64_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map_or(false, |e| e == "vst3") {
                        return Ok(p);
                    }
                }
            }
        }

        // Fallback: look for any .vst3 file in the bundle
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map_or(false, |e| e == "vst3") && p.is_file() {
                    return Ok(p);
                }
            }
        }
    }

    Err(format!("No VST3 DLL found at {}", path.display()))
}

/// Convert a null-terminated C string (c_char array) to a Rust String.
fn cstr_to_string(arr: &[std::ffi::c_char]) -> String {
    let bytes: Vec<u8> = arr
        .iter()
        .take_while(|&&b| b != 0)
        .map(|&b| b as u8)
        .collect();
    String::from_utf8_lossy(&bytes).into()
}

/// Convert a null-terminated wide string (u16 array) to a Rust String.
fn wstr_to_string(arr: &[u16]) -> String {
    let chars: Vec<u16> = arr
        .iter()
        .take_while(|&&c| c != 0)
        .copied()
        .collect();
    String::from_utf16_lossy(&chars)
}
