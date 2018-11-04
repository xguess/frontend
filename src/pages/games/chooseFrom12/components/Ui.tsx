import ClassNames from "classnames";
import * as React from "react";

import {CHOOSE_FROM_12_NUMS, getSelectedCoins} from "@dicether/state-channel";
import {HOUSE_EDGE, HOUSE_EDGE_DIVISOR, MIN_BET_VALUE} from "../../../../config/config";
import {Button, Col, FormGroup, Input, Label, Modal, Row, ValueInput} from "../../../../reusable";
import {formatEth} from "../../../../reusable/Ether";
import Grid from "./Grid";
import HowToPlay from "./HowToPlay";

const Style = require("./Ui.scss");

type Props = {
    num: number;
    value: number;
    maxBetValue: number;
    result: {num: number; won: boolean};
    showResult: boolean;
    showHelp: boolean;
    onToggleHelp(): void;
    onValueChange(value: number): void;
    onClick(diceNum: number): void;
    onPlaceBet(): void;
};

class Ui extends React.PureComponent<Props> {
    constructor(props: Props) {
        super(props);
    }

    render() {
        const {
            value,
            num,
            maxBetValue,
            result,
            showResult,
            showHelp,
            onToggleHelp,
            onValueChange,
            onClick,
            onPlaceBet,
        } = this.props;
        const selectedCoinsArray = getSelectedCoins(num);
        const numSelected = selectedCoinsArray.filter(x => x === true).length;
        const chance = numSelected / CHOOSE_FROM_12_NUMS;
        const houseEdgeFactor = 1 - HOUSE_EDGE / HOUSE_EDGE_DIVISOR;
        const payout = (1 / chance) * value * houseEdgeFactor;

        const colors = selectedCoinsArray.map(x => (x ? "white" : "200"));

        const buttonClassNames = ClassNames("betButton", Style.betButton);

        return (
            <div className={Style.ui}>
                <Row noGutters>
                    <Col lg={{size: 7, order: 2}} xl={{size: 8, order: 2}}>
                        <Grid
                            onClick={onClick}
                            selectedCoins={selectedCoinsArray}
                            result={result}
                            showResult={showResult}
                        />
                    </Col>
                    <Col lg={5} xl={4}>
                        <div className={Style.menu}>
                            <FormGroup className="games__form-group">
                                <Label>Bet amount (ETH)</Label>
                                <ValueInput
                                    value={value}
                                    min={MIN_BET_VALUE}
                                    step={MIN_BET_VALUE}
                                    max={maxBetValue}
                                    onChange={onValueChange}
                                />
                            </FormGroup>
                            <FormGroup className="games__form-group">
                                <Label>Profit on win (ETH)</Label>
                                <Input disabled readOnly value={formatEth(payout - value)} />
                            </FormGroup>
                            <FormGroup className="games__form-group hidden-xs-down">
                                <Label>Win chance</Label>
                                <Input disabled readOnly value={Math.round(chance * 100).toString()} suffix="%" />
                            </FormGroup>
                            <Button className="betButton" block color="success" onClick={onPlaceBet}>
                                Bet
                            </Button>
                        </div>
                    </Col>
                </Row>
                <Modal isOpen={showHelp} toggle={onToggleHelp}>
                    <HowToPlay />
                </Modal>
            </div>
        );
    }
}

export default Ui;