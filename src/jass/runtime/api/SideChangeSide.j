    local group g = CreateGroup()
    local unit u
    call GroupEnumUnitsOfPlayer(g, EmpSidePlayer(a1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        call SetUnitOwner(u, EmpSidePlayer(a2), true)
    endloop
    call DestroyGroup(g)
    set g = null
