// Debug report for unattended tests: CustomMapData\<DEBUG_REPORT_DIR>\<name>.pld every DEBUG_REPORT_PERIOD s.
function EmpDebugReport takes nothing returns nothing
    local string s = "t=" + I2S(EmpTick) + " phase=" + I2S(EmpPhase) + " tech=" + I2S(EmpTechLevel) + " enemy=" + I2S(EmpEnemyHouse) + " camp=" + I2S(EF_B2I(EmpInCampaign))
    local integer i = 0
    loop
        exitwhen i > {{RT.DEBUG_REPORT_SIDES}}
        set s = s + " s" + I2S(i) + "=" + I2S(EmpCount(i, 1)) + "u/" + I2S(EmpCount(i, 2)) + "b"
        set i = i + 1
    endloop
    set s = s + " gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " mines=" + I2S(EmpCount({{RT.NEUTRAL_SIDE}}, 0)) + " ended=" + I2S(EF_B2I(EmpEnded)) + " speech=" + I2S(EmpSpeechHead) + "/" + I2S(EmpSpeechTail) + " ms=" + I2S(EmpSpeechLastMs){{#if musicList}} + " music=" + I2S(GetSoundFileDuration({{jFirstTrack}})){{/if}}
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s)
    call PreloadGenEnd({{jReportFile}})
endfunction
