// ---- movie slide shows (src/emperor/fmv.ts, src/config/movies.ts) ----
// PlayCinematic shows nothing from a map in 1.31.1, so a movie is its frames switched on a UI
// backdrop over the whole screen, with its MP3. Movies are queued by name (";"-separated chains of
// MOVIES.TXT) while the hub works out what happened, then played in order; Esc skips one.
function EmpMovieData takes nothing returns nothing
    set EmpMovieTab = InitHashtable()
    set EmpMovieClock = CreateTimer()
    call TimerStart(EmpMovieClock, {{real MOVIE_CLOCK_SPAN}}, false, null)
{{movieDataLines}}
endfunction

// what the player did, for unattended checks: CustomMapData\{{movieReport}}
function EmpMovieLog takes string s returns nothing
    set EmpMovieLogText = EmpMovieLogText + s + " @" + R2S(TimerGetElapsed(EmpMovieClock)) + "; "
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(EmpMovieLogText)
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

function EmpMovieTick takes nothing returns nothing
    set EmpMovieFrame = EmpMovieFrame + 1
    if EmpMovieFrame >= EmpMovieFrames then
        call ExecuteFunc("EmpMovieNext") // defined below: it starts this timer
        return
    endif
    call BlzFrameSetTexture(EmpMovieView, {{str MOVIE_DIR}} + EmpMovieName + "\\" + SubString(I2S({{frameBase}} + EmpMovieFrame), 1, {{frameDigitsEnd}}) + ".blp", 0, true)
endfunction

// the next movie of the queue (skipping names without frames), or the end of the show
function EmpMovieNext takes nothing returns nothing
    local integer n
    local integer i
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
        set EmpMovieFrames = LoadInteger(EmpMovieTab, 0, StringHash(EmpMovieName))
        call EmpMovieLog(EmpMovieName + " frames=" + I2S(EmpMovieFrames) + " sound=" + I2S(GetSoundFileDuration({{str MOVIE_DIR}} + EmpMovieName + ".mp3")))
        if EmpMovieFrames > 0 then
            set EmpMovieFrame = 0
            call BlzFrameSetTexture(EmpMovieView, {{str MOVIE_DIR}} + EmpMovieName + "\\" + SubString(I2S({{frameBase}}), 1, {{frameDigitsEnd}}) + ".blp", 0, true)
            set EmpMovieSound = CreateSound({{str MOVIE_DIR}} + EmpMovieName + ".mp3", false, false, false, 10, 10, "")
            call SetSoundVolume(EmpMovieSound, {{MOVIE_VOLUME}})
            call StartSound(EmpMovieSound)
            call KillSoundWhenDone(EmpMovieSound)
            call TimerStart(EmpMovieTimer, {{real moviePeriod}}, true, function EmpMovieTick)
            return
        endif
    endloop
    // the show is over: interface and music back, then what was waiting for it
    call EmpMovieLog("end")
    call SetGameSpeed(EmpMovieSpeed)
    set EmpMoviePlaying = false
    call BlzFrameSetVisible(EmpMovieView, false)
    call BlzFrameSetVisible(EmpMovieBlack, false)
    call BlzHideOriginFrames(false)
    call ResumeMusic()
    call TriggerExecute(EmpMovieAfter)
endfunction

function EmpMovieSkip takes nothing returns nothing
    if EmpMoviePlaying then
        call EmpMovieNext()
    endif
endfunction

// play the queued movies, then run `after` (at once when nothing is queued)
function EmpMoviePlay takes code after returns nothing
    local framehandle ui
    set EmpMovieAfter = CreateTrigger()
    call TriggerAddAction(EmpMovieAfter, after)
    call EmpMovieLog("play [" + EmpMovieQueue + "]")
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
        // Esc skips the current movie (the key that skips cinematics)
        set EmpMovieEsc = CreateTrigger()
        call TriggerRegisterPlayerEvent(EmpMovieEsc, Player(0), EVENT_PLAYER_END_CINEMATIC)
        call TriggerAddAction(EmpMovieEsc, function EmpMovieSkip)
        set ui = null
    endif
    set EmpMoviePlaying = true
    // frames are switched by a game timer, the sound plays in real time: the campaign runs at the
    // player's game speed (2026-10-07: the movies ran about 1.25 times too fast, while timers of a
    // standalone map at speed 2 run 1:1 with real time - src/smoke/build-speed-probe.ts)
    set EmpMovieSpeed = GetGameSpeed()
    call EmpMovieLog("speed " + I2S(GetHandleId(EmpMovieSpeed)))
    call SetGameSpeed(MAP_SPEED_NORMAL)
    call EmpMovieLog("speed " + I2S(GetHandleId(GetGameSpeed())))
    call StopMusic(false)
    call BlzHideOriginFrames(true)
    call BlzFrameSetVisible(EmpMovieBlack, true)
    call BlzFrameSetVisible(EmpMovieView, true)
    call EmpMovieNext()
endfunction
