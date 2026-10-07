function EmpTickRun takes nothing returns nothing
    if EmpEnded then
        if not EmpResultSent then
            set EmpResultSent = true
            call EmpCampaignResult(EmpEndWin)
        endif
        return
    endif
    call EmpMissionTick()
    set EmpTick = EmpTick + 1
endfunction
