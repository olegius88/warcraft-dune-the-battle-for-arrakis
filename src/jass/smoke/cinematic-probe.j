// Cinematic probe: does the 1.31 client play a movie imported into the map (VP9 AVI at Movies\,
// MP3 at Movies\audio\, like its own movies)? The report has the time before / after the call.
function CinematicProbeRun takes nothing returns nothing
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("before " + R2S(TimerGetElapsed(udg_clock)))
    call PlayCinematic({{str movie}})
    call Preload("after " + R2S(TimerGetElapsed(udg_clock)))
    call PreloadGenEnd({{str report}})
endfunction
