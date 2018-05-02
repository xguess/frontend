import * as React from 'react';
import {connect} from 'react-redux';

import {Output} from '../../../reusable/index';
import {State as GameState} from '../../../rootReducer';
import {DispatchProp} from "../../../util/util";

const Style = require('./State.scss');


type EntryProps = {
    id: string,
    name: string,
    data?: string | number
}


const Entry = ({id, name, data}: EntryProps) => {
    if (data) {
        return (
            <div className={Style.gameState__entry}>
                <span>{name}</span>
                <Output className={Style.gameState__value} id={id} value={data}/>
            </div>
        );
    } else {
        return null;
    }
};


const mapStateToProps = ({games}: GameState) => {
    const {gameState} = games;

    return {
        gameState,
    }
};

type ReduxProps = ReturnType<typeof mapStateToProps>;

type Props = DispatchProp & ReduxProps;

const State = ({gameState}: Props) => {
    return (
        <div>
            <Entry id={'gameState_status'} name="Status" data={gameState.status}/>
            <Entry id={'gameState_reasonEnded'} name="Reason Ended" data={gameState.reasonEnded}/>
            <Entry id={'gameState_endTransactionHash'} name="End Transaction Hash" data={gameState.endTransactionHash}/>
            <Entry id={'gameState_gameId'} name="Game Id" data={gameState.gameId}/>
            <Entry id={'gameState_roundId'} name="Round Id" data={gameState.roundId}/>
            <Entry id={'gameState_gameType'} name="Game Type" data={gameState.gameType}/>
            <Entry id={'gameState_num'} name="Number" data={gameState.num}/>
            <Entry id={'gameState_betValue'} name="Bet Value" data={gameState.betValue}/>
            <Entry id={'gameState_balance'} name="Balance" data={gameState.balance}/>
            <Entry id={'gameState_serverHash'} name="Server Hash" data={gameState.serverHash}/>
            <Entry id={'gameState_playerHash'} name="Player Hash" data={gameState.playerHash}/>
            <Entry id={'gameState_serverSig'} name="Server Signature" data={gameState.serverSig}/>
            <Entry id={'gameState_playerSig'} name="Player Sigature" data={gameState.playerSig}/>
        </div>
    );
};

export default connect(mapStateToProps)(State);