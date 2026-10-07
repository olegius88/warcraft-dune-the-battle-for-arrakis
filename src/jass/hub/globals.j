
    gamecache EmpCache = null
    real array EmpTX
    real array EmpTY
    string array EmpTName
    integer array EmpOwner
    integer array EmpInitOwner
    integer array EmpAdj
    integer array EmpAdjCount
    string array EmpMapA
    string array EmpMapD
    unit array EmpMarker
    texttag array EmpLabel
    integer EmpPhase = {{PHASE.first}}
    integer EmpTech = {{START_TECH}}
    integer EmpCaptured = 0
    integer EmpBattles = 0
    integer EmpNoGain = 0
    integer EmpPendTerr = 0
    integer EmpPendKind = 0
    integer EmpPendEnemy = 0
    integer EmpPendFrom = 0
    string EmpNextMap = ""
    dialog EmpDialog = null
    button EmpBtnYes = null
    button EmpBtnNo = null
    integer EmpDialogMode = 0
    boolean EmpBusy = false
