import numpy as np
import scipy.signal as signal
import scipy.io.wavfile as wavfile

def process_gut_audio(file_path, threshold_dbfs=-24):
    # 1. Read Audio
    sample_rate, data = wavfile.read(file_path)
    
    # 2. Design 4th-order Butterworth Bandpass Filter (100-500 Hz)
    nyquist = 0.5 * sample_rate
    low = 100 / nyquist
    high = 500 / nyquist
    b, a = signal.butter(4, [low, high], btype='band')
    
    # 3. Apply Filter (using filtfilt for zero phase distortion)
    filtered_data = signal.filtfilt(b, a, data)
    
    # 4. Calculate Amplitude Envelope (500ms sliding window)
    window_size = int(0.5 * sample_rate)
    rectified_signal = np.abs(filtered_data)
    envelope = np.convolve(rectified_signal, np.ones(window_size)/window_size, mode='same')
    
    # 5. Convert to dBFS and apply threshold
    # Adding 1e-10 to prevent log(0) errors
    dbfs_envelope = 20 * np.log10(envelope / np.max(np.abs(data)) + 1e-10)
    
    # 6. Flag events
    events_detected = np.where(dbfs_envelope > threshold_dbfs)[0]
    
    return len(events_detected) > 0 # Returns True if gut sound detected

