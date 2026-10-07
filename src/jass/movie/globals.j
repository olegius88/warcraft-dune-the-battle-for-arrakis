    // movie slide shows (movie/player.j)
    hashtable EmpMovieTab = null
    string EmpMovieQueue = ""
    string EmpMovieName = ""
    integer EmpMovieFrame = 0
    integer EmpMovieFrames = 0
    real EmpMovieFps = 0.0
    framehandle EmpMovieView = null
    framehandle EmpMovieBlack = null
    framehandle EmpMovieSubStrip = null
    framehandle EmpMovieSubText = null
    framehandle EmpMovieCapText = null
    timer EmpMovieTimer = null
    sound EmpMovieSound = null
    trigger EmpMovieAfter = null
    trigger EmpMovieEsc = null
    boolean EmpMoviePlaying = false
    timer EmpMovieClock = null
    // subtitles (s) and place captions (c): times in ms from the movie start, the text
    integer array EmpSubStart
    integer array EmpSubEnd
    string array EmpSubText
    integer EmpSubCount = 0
    integer EmpSubAt = 0
    integer EmpSubLast = 0
    integer array EmpCapStart
    integer array EmpCapEnd
    string array EmpCapText
    real array EmpCapY
    integer EmpCapCount = 0
    integer EmpCapAt = 0
    integer EmpCapLast = 0
    // report lines (Preload truncates one long line)
    string array EmpMovieLogLine
    integer EmpMovieLogCount = 0
