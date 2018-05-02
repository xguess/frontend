import {ActionType, assertNever, fixedLengthAddElement} from '../../../util/util'
import * as types from './constants';

import {Message} from './types'
import * as actions from "./actions";


export type Actions = ActionType<typeof actions>;


export type State = {
    readonly show: boolean,
    readonly messages: Array<Message>,
    readonly numUsers: number,
}

const initialState : State = {
    show: window.innerWidth >= 992,
    messages: [],
    numUsers: 0,
};

const MAX_MESSAGES = 50;


export default function chat(state : State = initialState, action : Actions): State {
    switch(action.type) {
        case types.TOGGLE_CHAT:
            return Object.assign({}, state, {
                show: action.show
            });
        case types.CHANGE_MESSAGES:
            return Object.assign({}, state, {
                messages: action.messages
            });
        case types.ADD_MESSAGE:
            const messages = fixedLengthAddElement(state.messages, action.message, MAX_MESSAGES);
            return Object.assign({}, state, {
                messages
            });
        case types.CHANGE_USERS_ONLINE:
            return Object.assign({}, state, {
                numUsers: action.numUsers
            });
        default:
            assertNever(action);
            return state;
    }
}