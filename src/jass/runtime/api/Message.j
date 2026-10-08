    if EmpMsgText[a1] != null then
        call EmpShow(EmpMsgText[a1])
    endif
    // an allygain message: the sub-house's alliance, stored if the mission is won (mission campaign.j)
    // an allybreak message (negative): ended whatever the result; of gain and break the later counts
    if EmpMsgAlly[a1] > 0 then
        set EmpAllyGain[EmpMsgAlly[a1]] = true
        set EmpAllyBreak[EmpMsgAlly[a1]] = false
    elseif EmpMsgAlly[a1] < 0 then
        set EmpAllyBreak[-EmpMsgAlly[a1]] = true
        set EmpAllyGain[-EmpMsgAlly[a1]] = false
    endif
    call EmpSpeak(EmpMsgSound[a1], EmpMsgSoundLen[a1])
