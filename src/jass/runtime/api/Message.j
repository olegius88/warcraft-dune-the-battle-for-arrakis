    if EmpMsgText[a1] != null then
        call EmpShow(EmpMsgText[a1])
    endif
    // an allygain message: the sub-house's alliance, stored if the mission is won (mission campaign.j)
    if EmpMsgAlly[a1] > 0 then
        set EmpAllyGain[EmpMsgAlly[a1]] = true
    endif
    call EmpSpeak(EmpMsgSound[a1], EmpMsgSoundLen[a1])
