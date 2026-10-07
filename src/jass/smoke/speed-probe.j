// Game speed probe: how fast do JASS timers run against real time at each map speed? The report is
// rewritten every {{step}} game seconds with the speed and the game time; the runner notes the real
// time of each write (src/smoke/build-speed-probe.ts). 2026-10-07: movie slide shows in the hub ran
// ahead of their sound.
function SpeedProbeTick takes nothing returns nothing
    set udg_n = udg_n + 1
    if udg_n == {{switchAt}} then
        call SetGameSpeed(MAP_SPEED_NORMAL)
    endif
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("n=" + I2S(udg_n) + " t=" + R2S(TimerGetElapsed(udg_clock)) + " speed=" + I2S(GetHandleId(GetGameSpeed())))
    call PreloadGenEnd({{str report}})
endfunction

function SpeedProbeRun takes nothing returns nothing
    call TimerStart(CreateTimer(), {{real step}}, true, function SpeedProbeTick)
endfunction
