// Sound probe (src/smoke/build-sound-probe.ts): which of the movie sounds (loose WAV / MP3 files of
// different lengths) does the 1.31.1 client open and play? 2026-10-08 the intro stopped when it came
// to I00_F02E (203 s, 35.8 MB WAV). One report line per file, written before and after each call.
function SoundProbeLog takes string s returns nothing
    set udg_log[udg_n] = s
    set udg_n = udg_n + 1
    call PreloadGenClear()
    call PreloadGenStart()
    set udg_i = 0
    loop
        exitwhen udg_i >= udg_n
        call Preload(udg_log[udg_i])
        set udg_i = udg_i + 1
    endloop
    call PreloadGenEnd({{str report}})
endfunction

function SoundProbeOne takes string file returns nothing
    local sound s
    call SoundProbeLog("open " + file)
    call SoundProbeLog("duration " + file + " " + I2S(GetSoundFileDuration(file)))
    set s = CreateSound(file, false, false, false, 10, 10, "")
    call StartSound(s)
    call SoundProbeLog("started " + file)
    call TriggerSleepAction(1.0)
    call StopSound(s, true, false)
    call SoundProbeLog("stopped " + file)
endfunction

function SoundProbeRun takes nothing returns nothing
{{calls}}
    call SoundProbeLog("end")
endfunction
