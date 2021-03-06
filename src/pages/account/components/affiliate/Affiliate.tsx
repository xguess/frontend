import axios from "axios";
import * as React from "react";
import {Trans, WithNamespaces, withNamespaces} from "react-i18next";

import {connect} from "react-redux";
import {showSuccessMessage} from "../../../../platform/modules/utilities/actions";
import {catchError} from "../../../../platform/modules/utilities/asyncActions";
import {Dispatch} from "../../../../util/util";
import Balance from "./Balance";
import Campaigns from "./Campaigns";
import CreateCampaign from "./CreateCampaign";
import {Campaign} from "./types";

const mapDispatchToProps = (dispatch: Dispatch) => ({
    catchError: (error: Error) => catchError(error, dispatch),
    showSuccessMessage: (message: string) => dispatch(showSuccessMessage(message)),
});

type State = {
    campaigns: Campaign[];
    balance: number;
};

type Props = ReturnType<typeof mapDispatchToProps> & WithNamespaces;

const DESCRIPTION_LINK = "https://medium.com/@dicether/how-to-create-a-dicether-affiliate-campaign-705f4be06c54";

class Affiliate extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            campaigns: [],
            balance: 0,
        };
    }

    componentDidMount() {
        this.fetchData();
    }

    fetchData = () => {
        const {catchError} = this.props;
        axios
            .get("/affiliate/campaigns")
            .then(response => {
                this.setState({
                    campaigns: response.data.campaigns,
                    balance: response.data.balance,
                });
            })
            .catch(error => catchError(error));
    }

    createCampaign = (id: string, name: string) => {
        const {catchError, showSuccessMessage} = this.props;
        axios
            .post("/affiliate/createCampaign", {id, name})
            .then(response => {
                const campaign = response.data;
                this.setState({
                    campaigns: [...this.state.campaigns, campaign],
                });
                showSuccessMessage(`Created new campaign ${name}!`);
            })
            .catch(error => catchError(error));
    }

    withdrawBalance = () => {
        const {catchError, showSuccessMessage} = this.props;
        axios
            .post("/affiliate/withdraw")
            .then(() => {
                this.setState({
                    balance: 0,
                });
                showSuccessMessage("Balance withdrawn!");
            })
            .catch(error => catchError(error));
    }

    render() {
        const {t} = this.props;
        const {campaigns, balance} = this.state;

        return (
            <div>
                <div>
                    <p>
                        <Trans i18nKey="affiliateDescription">
                            Dicether offers a 10% affiliate system. You will receive 10% of the expected house edge for
                            every bet placed by a referred user. For a detailed description see{" "}
                            <a target="_blank" href={DESCRIPTION_LINK}>
                                How to create a affiliate campaign
                            </a>
                            .
                        </Trans>
                    </p>
                </div>
                <Balance balance={balance} withDrawBalance={this.withdrawBalance} />
                <CreateCampaign onCreateCampaign={this.createCampaign} />
                <Campaigns campaigns={campaigns} />
            </div>
        );
    }
}

export default withNamespaces()(
    connect(
        null,
        mapDispatchToProps
    )(Affiliate)
);
