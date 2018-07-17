import 'babel-polyfill';
import Raven from "raven-js";
import * as React from 'react';
import {render} from 'react-dom';
import 'what-input';

import Root from './Root';
import './googleanalytics';
import './util/prototypes';
import './config/interceptors';
import {store} from "./store";
import {parseReferral} from "./util/affiliate";

parseReferral();

const root = document.getElementById('root');
if (root !== null) {
    Raven.context(() => {
        render(
            <Root store={store}/>,
            root
        );
    });
}
