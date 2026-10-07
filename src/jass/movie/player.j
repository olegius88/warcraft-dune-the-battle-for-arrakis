// ---- movie slide shows (src/emperor/movie-player.ts, src/emperor/fmv.ts, src/config/movies.ts) ----
// PlayCinematic shows nothing from a map in 1.31.1, so a movie is its frames (loose JPEG BLP files in
// the Warcraft III folder) switched on a UI backdrop over the whole screen at the movie's own rate,
// with its WAV, the subtitles of its spoken lines and Emperor's place captions. Movies are queued by
// name (";"-separated chains of MOVIES.TXT), then played in order; Esc skips one.
// Frames are switched by a game timer while the sound plays in real time: they matched to 0.01 s
// over 156 s at 15 fps (2026-10-08, src/smoke/build-fmv-probe.ts).
{{dataFunctions}}
function EmpMovieData takes nothing returns nothing
    set EmpMovieTab = InitHashtable()
    set EmpMovieClock = CreateTimer()
    call TimerStart(EmpMovieClock, {{real MOVIE_CLOCK_SPAN}}, false, null)
{{dataCalls}}
endfunction

// what the player did, for unattended checks: CustomMapData\{{movieReport}}, one line per entry
function EmpMovieLog takes string s returns nothing
    local integer i = 0
    if EmpMovieLogCount >= {{MOVIE_REPORT_LINES}} then
        loop
            exitwhen i >= EmpMovieLogCount - 1
            set EmpMovieLogLine[i] = EmpMovieLogLine[i + 1]
            set i = i + 1
        endloop
        set EmpMovieLogCount = EmpMovieLogCount - 1
    endif
    set EmpMovieLogLine[EmpMovieLogCount] = s + " @" + R2S(TimerGetElapsed(EmpMovieClock))
    set EmpMovieLogCount = EmpMovieLogCount + 1
    call PreloadGenClear()
    call PreloadGenStart()
    set i = 0
    loop
        exitwhen i >= EmpMovieLogCount
        call Preload(EmpMovieLogLine[i])
        set i = i + 1
    endloop
    call PreloadGenEnd({{str movieReport}})
endfunction

function EmpMovieAdd takes string chain returns nothing
    if chain == "" then
        return
    elseif EmpMovieQueue == "" then
        set EmpMovieQueue = chain
    else
        set EmpMovieQueue = EmpMovieQueue + ";" + chain
    endif
endfunction

// subtitles and captions at `ms` from the movie start
function EmpMovieText takes integer ms returns nothing
    local integer i
    local string s = ""
    local real y = 0.0
    loop
        exitwhen EmpSubAt >= EmpSubLast
        exitwhen EmpSubEnd[EmpSubAt] > ms
        set EmpSubAt = EmpSubAt + 1
    endloop
    if EmpSubAt < EmpSubLast and EmpSubStart[EmpSubAt] <= ms then
        call BlzFrameSetText(EmpMovieSubText, EmpSubText[EmpSubAt])
        call BlzFrameSetVisible(EmpMovieSubStrip, true)
        call BlzFrameSetVisible(EmpMovieSubText, true)
    else
        call BlzFrameSetVisible(EmpMovieSubStrip, false)
        call BlzFrameSetVisible(EmpMovieSubText, false)
    endif
    // captions may overlap (two rows): every active one, one per line
    set i = EmpCapAt
    loop
        exitwhen i >= EmpCapLast
        if EmpCapStart[i] <= ms and EmpCapEnd[i] > ms then
            if s == "" then
                set s = EmpCapText[i]
                set y = EmpCapY[i]
            else
                set s = s + "|n" + EmpCapText[i]
            endif
        endif
        set i = i + 1
    endloop
    if s == "" then
        call BlzFrameSetVisible(EmpMovieCapText, false)
    else
        call BlzFrameClearAllPoints(EmpMovieCapText)
        call BlzFrameSetAbsPoint(EmpMovieCapText, FRAMEPOINT_TOPLEFT, {{real MOVIE_CAPTION.left}}, y)
        call BlzFrameSetAbsPoint(EmpMovieCapText, FRAMEPOINT_BOTTOMRIGHT, {{real MOVIE_CAPTION.right}}, y - {{real capBox}})
        call BlzFrameSetText(EmpMovieCapText, s)
        call BlzFrameSetVisible(EmpMovieCapText, true)
    endif
endfunction

function EmpMovieTick takes nothing returns nothing
    set EmpMovieFrame = EmpMovieFrame + 1
    if EmpMovieFrame >= EmpMovieFrames then
        call ExecuteFunc("EmpMovieNext") // defined below: it starts this timer
        return
    endif
    call BlzFrameSetTexture(EmpMovieView, {{str MOVIE_DIR}} + EmpMovieName + "\\" + SubString(I2S({{frameBase}} + EmpMovieFrame), 1, {{frameDigitsEnd}}) + ".blp", 0, true)
    call EmpMovieText(R2I(EmpMovieFrame * 1000.0 / EmpMovieFps))
endfunction

// the next movie of the queue (skipping names without frames), or the end of the show
function EmpMovieNext takes nothing returns nothing
    local integer n
    local integer i
    local integer h
    call PauseTimer(EmpMovieTimer)
    if EmpMovieSound != null then
        call StopSound(EmpMovieSound, true, false)
        set EmpMovieSound = null
    endif
    loop
        set n = StringLength(EmpMovieQueue)
        exitwhen n == 0
        set i = 0
        loop
            exitwhen i >= n
            exitwhen SubString(EmpMovieQueue, i, i + 1) == ";"
            set i = i + 1
        endloop
        set EmpMovieName = SubString(EmpMovieQueue, 0, i)
        if i >= n then
            set EmpMovieQueue = ""
        else
            set EmpMovieQueue = SubString(EmpMovieQueue, i + 1, n)
        endif
        set h = StringHash(EmpMovieName)
        set EmpMovieFrames = LoadInteger(EmpMovieTab, 0, h)
        set EmpMovieFps = LoadReal(EmpMovieTab, 1, h)
        set EmpSubAt = LoadInteger(EmpMovieTab, 2, h)
        set EmpSubLast = EmpSubAt + LoadInteger(EmpMovieTab, 3, h)
        set EmpCapAt = LoadInteger(EmpMovieTab, 4, h)
        set EmpCapLast = EmpCapAt + LoadInteger(EmpMovieTab, 5, h)
        call EmpMovieLog(EmpMovieName + " frames=" + I2S(EmpMovieFrames) + " fps=" + R2S(EmpMovieFps) + " sound=" + I2S(GetSoundFileDuration({{str MOVIE_DIR}} + EmpMovieName + {{str soundExt}})) + " subs=" + I2S(EmpSubLast - EmpSubAt) + " caps=" + I2S(EmpCapLast - EmpCapAt))
        if EmpMovieFrames > 0 and EmpMovieFps > 0.0 then
            set EmpMovieFrame = 0
            call BlzFrameSetTexture(EmpMovieView, {{str MOVIE_DIR}} + EmpMovieName + "\\" + SubString(I2S({{frameBase}}), 1, {{frameDigitsEnd}}) + ".blp", 0, true)
            // a silent movie (the credits) keeps the map's music; Emperor names none for it (assumed)
            if LoadBoolean(EmpMovieTab, 6, h) then
                call StopMusic(false)
                set EmpMovieSound = CreateSound({{str MOVIE_DIR}} + EmpMovieName + {{str soundExt}}, false, false, false, 10, 10, "")
                call SetSoundVolume(EmpMovieSound, {{MOVIE_VOLUME}})
                call StartSound(EmpMovieSound)
                call KillSoundWhenDone(EmpMovieSound)
            else
                call ResumeMusic()
            endif
            call EmpMovieText(0)
            call TimerStart(EmpMovieTimer, 1.0 / EmpMovieFps, true, function EmpMovieTick)
            return
        endif
    endloop
    // the show is over: interface and music back, then what was waiting for it
    call EmpMovieLog("end")
    set EmpMoviePlaying = false
    call BlzFrameSetVisible(EmpMovieView, false)
    call BlzFrameSetVisible(EmpMovieBlack, false)
    call BlzFrameSetVisible(EmpMovieSubStrip, false)
    call BlzFrameSetVisible(EmpMovieSubText, false)
    call BlzFrameSetVisible(EmpMovieCapText, false)
    call BlzHideOriginFrames(false)
    call ResumeMusic()
    call TriggerExecute(EmpMovieAfter)
endfunction

function EmpMovieSkip takes nothing returns nothing
    if EmpMoviePlaying then
        call EmpMovieNext()
    endif
endfunction

function EmpMovieTextFrame takes framehandle parent, real height returns framehandle
    local framehandle f = BlzCreateFrameByType("TEXT", "EmpMovieText", parent, "", 0)
    call BlzFrameSetFont(f, {{str MOVIE_SUBTITLE.font}}, height, 0)
    call BlzFrameSetTextAlignment(f, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_CENTER)
    call BlzFrameSetVisible(f, false)
    return f
endfunction

// play the queued movies, then run `after` (at once when nothing is queued)
function EmpMoviePlay takes code after returns nothing
    local framehandle ui
    set EmpMovieAfter = CreateTrigger()
    call TriggerAddAction(EmpMovieAfter, after)
    call EmpMovieLog("play [" + EmpMovieQueue + "] speed " + I2S(GetHandleId(GetGameSpeed())))
    if EmpMovieQueue == "" then
        call TriggerExecute(EmpMovieAfter)
        return
    endif
    if EmpMovieTimer == null then
        set ui = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0)
        set EmpMovieTimer = CreateTimer()
        set EmpMovieBlack = BlzCreateFrameByType("BACKDROP", "EmpMovieBlack", ui, "", 0)
        call BlzFrameSetAbsPoint(EmpMovieBlack, FRAMEPOINT_TOPLEFT, {{real MOVIE_BLACK_AREA.left}}, {{real MOVIE_BLACK_AREA.top}})
        call BlzFrameSetAbsPoint(EmpMovieBlack, FRAMEPOINT_BOTTOMRIGHT, {{real MOVIE_BLACK_AREA.right}}, {{real MOVIE_BLACK_AREA.bottom}})
        call BlzFrameSetTexture(EmpMovieBlack, {{str MOVIE_PATH.black}}, 0, true)
        set EmpMovieView = BlzCreateFrameByType("BACKDROP", "EmpMovie", ui, "", 0)
        call BlzFrameSetAbsPoint(EmpMovieView, FRAMEPOINT_TOPLEFT, {{real MOVIE_AREA.left}}, {{real MOVIE_AREA.top}})
        call BlzFrameSetAbsPoint(EmpMovieView, FRAMEPOINT_BOTTOMRIGHT, {{real MOVIE_AREA.right}}, {{real MOVIE_AREA.bottom}})
        set EmpMovieSubStrip = BlzCreateFrameByType("BACKDROP", "EmpMovieSubStrip", ui, "", 0)
        call BlzFrameSetAbsPoint(EmpMovieSubStrip, FRAMEPOINT_TOPLEFT, {{real MOVIE_SUBTITLE.area.left}}, {{real MOVIE_SUBTITLE.area.top}})
        call BlzFrameSetAbsPoint(EmpMovieSubStrip, FRAMEPOINT_BOTTOMRIGHT, {{real MOVIE_SUBTITLE.area.right}}, {{real MOVIE_SUBTITLE.area.bottom}})
        call BlzFrameSetTexture(EmpMovieSubStrip, {{str MOVIE_PATH.black}}, 0, true)
        call BlzFrameSetAlpha(EmpMovieSubStrip, {{MOVIE_SUBTITLE.stripAlpha}})
        set EmpMovieSubText = EmpMovieTextFrame(ui, {{real MOVIE_SUBTITLE.fontHeight}})
        call BlzFrameSetAbsPoint(EmpMovieSubText, FRAMEPOINT_TOPLEFT, {{real MOVIE_SUBTITLE.area.left}}, {{real MOVIE_SUBTITLE.area.top}})
        call BlzFrameSetAbsPoint(EmpMovieSubText, FRAMEPOINT_BOTTOMRIGHT, {{real MOVIE_SUBTITLE.area.right}}, {{real MOVIE_SUBTITLE.area.bottom}})
        set EmpMovieCapText = EmpMovieTextFrame(ui, {{real MOVIE_CAPTION.fontHeight}})
        // Esc skips the current movie (the key that skips cinematics; verified in the campaign 2026-10-07:
        // Esc 20 s into H01_F00E started H02_F00E at 23.1 s instead of 156.5 s)
        set EmpMovieEsc = CreateTrigger()
        call TriggerRegisterPlayerEvent(EmpMovieEsc, Player(0), EVENT_PLAYER_END_CINEMATIC)
        call TriggerAddAction(EmpMovieEsc, function EmpMovieSkip)
        set ui = null
    endif
    set EmpMoviePlaying = true
    call BlzHideOriginFrames(true)
    call BlzFrameSetVisible(EmpMovieBlack, true)
    call BlzFrameSetVisible(EmpMovieView, true)
    call EmpMovieNext()
endfunction
