    // (object type, threat): AI units attack the most threatening type nearby first (EmpThreatTarget)
    if EmpThreat == null then
        set EmpThreat = InitHashtable()
    endif
    call SaveInteger(EmpThreat, a1, 0, a2)
    if a2 > 0 then
        set EmpThreatAny = true
    endif
