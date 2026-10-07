function Smoke2Actions takes nothing returns nothing
    local gamecache gc = InitGameCacheBJ( "DuneSmoke.w3v" )
    local integer v = GetStoredIntegerBJ( "value", "smoke", gc )
    call DisplayTimedTextToForce( GetPlayersAll(), 60.0, "SMOKE 2: cache value = " + I2S(v) + " (expected 42)" )
    call SmokeLog( "smoke2.pld", "smoke2 cache=" + I2S(v) )
    call TriggerSleepAction( 5.0 )
    call DisplayTimedTextToForce( GetPlayersAll(), 60.0, "SMOKE 2: PlayCinematic test" )
    // PlayCinematic shows nothing from a map: 3.0.0.24268 with an imported Bink-1 .bik, and 1.31.1
    // with an imported VP9 AVI + MP3 like its own movies and even with its own Movies\HumanEd.avi
    // (src/smoke/build-cinematic-probe.ts, 2026-10-07). Emperor's movies are slide shows on a UI
    // backdrop in the hubs instead (src/jass/hub/movie.j).
    // TODO(fmv): the generic movies (IntroPrologue, IntroAnimation, HouseIntro of MOVIES.TXT) are not
    // shown: the campaign has no map before the house start missions; Phase0a plays in the hub after
    // the start mission, not before it.
    call SmokeLog( "smoke2-cine.pld", "before PlayCinematic" )
    call PlayCinematic( {{str bikName}} )
    call SmokeLog( "smoke2-cine.pld", "after PlayCinematic" )
endfunction
