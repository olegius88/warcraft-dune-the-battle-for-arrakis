
    integer EmpTick = 0
    integer EmpNextSide = 2
    integer EmpPlayerTerritory = 0
    integer EmpEnemyTerritory = 0
    real array EmpScriptX
    real array EmpScriptY
    integer EmpBaseCount = 0
    real array EmpBaseX
    real array EmpBaseY
    integer array EmpBaseOwner
    integer array EmpSideBase
    integer EmpEntrCount = 0
    real array EmpEntrX
    real array EmpEntrY
    integer array EmpEntrTag
    string array EmpMsgText
    string array EmpMsgSound
    real array EmpMsgSoundLen
    string array EmpSpeechQ
    real array EmpSpeechQLen
    integer EmpSpeechHead = 0
    integer EmpSpeechTail = 0
    real EmpSpeechLeft = 0.0
    timer EmpSpeechTimer = null
    integer EmpSpeechLastMs = -1
    string array EmpTipText
    boolean array EmpAttacked
    integer array EmpAIMode
    location array EmpAITarget
    unit array EmpAIUnit
    integer array EmpAITargetSide
    boolean array EmpAIControlled
    integer EmpOutcome = -1
    boolean EmpEnded = false
    location EmpCamStore = null
    boolean EmpCamSet = false
    real EmpMapMinX = 0.0
    real EmpMapMinY = 0.0
    real EmpMapMaxX = 0.0
    real EmpMapMaxY = 0.0
    group EmpTmpGroup = null
    integer EmpTmpSide = 0
    integer EmpTmpCount = 0
    integer EmpTmpType = 0
    real EmpTmpX = 0.0
    real EmpTmpY = 0.0
    real EmpTmpR = 0.0
    boolean EmpTmpBool = false
    unit EmpTmpUnit = null
    boolean EmpNormalConditions = true
    integer EmpLastBuiltSide = -1
    unit EmpLastBuilt = null
    integer EmpLastDelivered = -1
    boolean EmpDefendMode = false
    integer EmpWavesLeft = 0
    boolean EmpEndWin = false
    hashtable EmpPowerTab = null
    unit EmpWorm = null
    integer EmpWormEnd = 0
    group array EmpStrike
    integer array EmpStrikeEnd
    unit EmpVetArgUnit = null
    integer EmpVetArgLevel = 0
    boolean array EmpLowPower
    boolean EmpResultSent = false
    timer EmpTimer = null
    timerdialog EmpTimerWindow = null
    item array EmpCrateItem
    integer array EmpCrateGift
    integer array EmpCrateCash
    integer array EmpCrateEnd
    integer EmpCrateCount = 0
    group EmpStealthGroup = null
    integer EmpStealthEnd = 0
    timer EmpCamSpinTimer = null
    real EmpCamSpin = 0.0
    integer EmpCamMoveEnd = 0
    fogmodifier EmpPipFog = null
    timer EmpPipTimer = null
    unit EmpPipUnit = null
    real EmpPipX = 0.0
    real EmpPipY = 0.0
    real EmpPipStoreX = 0.0
    real EmpPipStoreY = 0.0
    integer EmpPipMoveEnd = 0
    boolean EmpPipSpin = false
    boolean array EmpAIIgnore
    hashtable EmpThreat = null
    boolean EmpThreatAny = false
    fogmodifier array EmpShroudMod
    real array EmpShroudX
    real array EmpShroudY
    integer EmpShroudCount = 0
    boolean array EmpWormAttract
    boolean array EmpWormRepel
    integer EmpPlayerHouse = 0
    integer array EmpReinfType
    integer array EmpReinfCost
    integer array EmpReinfTech
    integer array EmpReinfCount
    integer array EmpReinfValue
    integer array EmpReinfAfter
    integer array EmpReinfNext
    boolean array EmpReinfWarned
    timer EmpReinfTimer = null
    integer EmpReinfDelay = 0
    integer EmpReinfVariation = 0
    integer EmpReinfMessage = 0
    integer EmpReinfInitial = 0
    integer EmpReinfSubsequent = 0
