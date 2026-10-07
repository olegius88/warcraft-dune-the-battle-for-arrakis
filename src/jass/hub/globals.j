
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
    // movie slide shows (hub/movie.j)
    hashtable EmpMovieTab = null
    string EmpMovieQueue = ""
    string EmpMovieName = ""
    integer EmpMovieFrame = 0
    integer EmpMovieFrames = 0
    framehandle EmpMovieView = null
    framehandle EmpMovieBlack = null
    timer EmpMovieTimer = null
    sound EmpMovieSound = null
    trigger EmpMovieAfter = null
    trigger EmpMovieEsc = null
    boolean EmpMoviePlaying = false
    integer EmpEnding = 0
    string EmpMovieLogText = ""
