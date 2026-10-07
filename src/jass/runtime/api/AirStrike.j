    // AirStrike(id, from, side, types...): aircraft of 'side' fly in at 'from' and attack the base of
    // the side's enemy (player <-> main enemy); AirStrikeDone(id): all down, or time is up (then the
    // survivors leave = are removed).
    local integer slot = ModuloInteger(a1, {{RT.AIRSTRIKE_SLOTS}})
    local integer b
    if a3 == 0 then
        set b = EmpBaseOfSide(1)
    else
        set b = EmpBaseOfSide(0)
    endif
    if EmpStrike[slot] == null then
        set EmpStrike[slot] = CreateGroup()
    endif
    call GroupClear(EmpStrike[slot])
    set EmpStrikeEnd[slot] = EmpTick + {{airstrikeTicks}}
    if a2 == null then
        return
    endif
    call EmpStrikeAdd(slot, a3, a4, a2, b)
    call EmpStrikeAdd(slot, a3, a5, a2, b)
    call EmpStrikeAdd(slot, a3, a6, a2, b)
    call EmpStrikeAdd(slot, a3, a7, a2, b)
    call EmpStrikeAdd(slot, a3, a8, a2, b)
    call EmpStrikeAdd(slot, a3, a9, a2, b)
    call EmpStrikeAdd(slot, a3, a10, a2, b)
