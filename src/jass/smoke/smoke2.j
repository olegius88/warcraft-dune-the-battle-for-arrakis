function Smoke2Actions takes nothing returns nothing
    local gamecache gc = InitGameCacheBJ( "DuneSmoke.w3v" )
    local integer v = GetStoredIntegerBJ( "value", "smoke", gc )
    call DisplayTimedTextToForce( GetPlayersAll(), 60.0, "SMOKE 2: cache value = " + I2S(v) + " (expected 42)" )
    call SmokeLog( "smoke2.pld", "smoke2 cache=" + I2S(v) )
    call TriggerSleepAction( 5.0 )
    call DisplayTimedTextToForce( GetPlayersAll(), 60.0, "SMOKE 2: PlayCinematic test" )
    // TODO(fmv): in 3.0.0.24268 PlayCinematic on an imported Bink-1 .bik returns immediately and
    // nothing is shown (standalone run 2026-10-07). Untested: inside a .w3n, other paths/formats.
    // Risk: Emperor FMVs may have to become in-engine cutscenes.
    call SmokeLog( "smoke2-cine.pld", "before PlayCinematic" )
    call PlayCinematic( {{str bikName}} )
    call SmokeLog( "smoke2-cine.pld", "after PlayCinematic" )
endfunction
