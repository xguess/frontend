import * as React from "react";
import {Container as BootstrapContainer} from "reactstrap";

type Props = {
    children: React.ReactNode;
};

const Container = ({...rest}: Props) => <BootstrapContainer {...rest} />;

export default Container;
