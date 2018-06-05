import * as React from "react";
import {Jumbotron} from "reactstrap";
import {Button, Container, Section} from "../../../reusable";
import JoinNow from "./JoinNow";

const Style = require("./Overview.scss");

const Overview = () => (
    <div className={Style.overview}>
        <Container>
            <Jumbotron className={Style.jumbotron}>
                <h1> The state channel dice casino</h1>
                <JoinNow/>
                <span className={Style.info}>No details required! Login with Metamask or similar!</span>
            </Jumbotron>
        </Container>
    </div>
);

export default Overview;