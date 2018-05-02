import * as React from 'react';
import moment from 'moment';

import {Bet} from '../../../../platform/modules/bets/types';
import {Ether} from '../../../../reusable';

const Style = require('./Overview.scss');

type Props = {
    bet: Bet
}

const Overview = ({bet}: Props) => (
    <div className={Style.overview}>
        <h3>Dice:{bet.id}</h3>
        <span>{moment(bet.timestamp).format('lll')}</span>
        <span>Placed by <strong>{bet.user.username}</strong></span>
        <div className={Style.overview__stats}>
            <div className={Style.overview__statEntry}>
                <span className={Style.overview__entryHeader}>Wagered</span>
                <Ether gwei={bet.value}/>
            </div>
            <div className={Style.overview__statEntry}>
                <span className={Style.overview__entryHeader}>Profit</span>
                <Ether colored gwei={bet.profit}/>
            </div>
        </div>
    </div>
);

export default Overview;