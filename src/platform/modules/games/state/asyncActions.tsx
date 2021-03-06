import {
    Bet,
    calcNewBalance,
    calcResultNumber,
    calcUserProfit,
    createHashChain,
    createTypedData,
    fromGweiToWei,
    GameStatus as ContractStatus,
    keccak,
    ReasonEnded as ContractReasonEnded,
    verifySeed,
    verifySignature,
} from "@dicether/state-channel";
import retry from "async-retry";
import axios from "axios";
import Raven from "raven-js";
import Web3 from "web3";

import {TransactionReceipt} from "../../../../../typings/web3/types";
import {
    CHAIN_ID,
    CONTRACT_ADDRESS,
    NETWORK_ID,
    NETWORK_NAME,
    SERVER_ADDRESS,
    SIGNATURE_VERSION,
} from "../../../../config/config";
import {getLogGameCreated, getReasonEnded} from "../../../../contractUtils";
import {Dispatch, GetState, isLocalStorageAvailable} from "../../../../util/util";
import {catchError} from "../../utilities/asyncActions";
import {getTransactionReceipt, signTypedData} from "../../web3/asyncActions";
import {
    addBet,
    creatingGame,
    endedGame,
    endedWithReason,
    gameCreated,
    restoreState,
    revealSeed,
    serverConflictEnd,
    userAbortConflictEnd,
    userAbortForceEnd,
    userConflictEnd,
    userInitiateConflictEnd,
    userInitiateForceEnd,
} from "./actions";
import {ReasonEnded, State, State as GameState} from "./reducer";

const STORAGE_VERSION = 2;

//
// Event handling
//
function canCreateGame(gameState: GameState) {
    const status = gameState.status;
    return status === "ENDED" || (status === "CREATING" && !gameState.createTransactionHash);
}

function createGameEvent(hashChain: string[], serverEndHash: string, value: number, transactionHash?: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canCreateGame(getState().games.gameState)) {
            dispatch(creatingGame(hashChain, serverEndHash, value, transactionHash));
        } else {
            Raven.captureMessage("Unexpected createGameEvent");
        }
    };
}

function canEndGame(gameState: GameState) {
    const status = gameState.status;
    return status !== "ENDED";
}

function endGameEvent(reason: ReasonEnded) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canEndGame(getState().games.gameState)) {
            dispatch(endedWithReason(reason));
        } else {
            Raven.captureMessage("Unexpected endGameEvent");
        }
    };
}

function canRegularEndGame(gameState: GameState) {
    const status = gameState.status;
    return status === "ACTIVE";
}

function regularEndGameEvent(
    roundId: number,
    serverHash: string,
    userHash: string,
    serverSig: string,
    userSig: string,
    endTransactionHash: string
) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canRegularEndGame(getState().games.gameState)) {
            dispatch(endedGame(roundId, serverHash, userHash, serverSig, userSig, endTransactionHash));
        } else {
            Raven.captureMessage("Unexpected regularEndGameEvent");
        }
    };
}

function canActivateGame(gameState: GameState) {
    const status = gameState.status;
    return status === "CREATING";
}

function activateGameEvent(gameId: number, serverHash: string, userHash: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        const gameState = getState().games.gameState;
        if (canActivateGame(gameState)) {
            if (serverHash !== gameState.serverHash) {
                throw Error(`Unexpectd serverHash: ${serverHash}, expected ${gameState.serverHash}`);
            }
            if (userHash !== gameState.userHash) {
                throw Error(`Unexpectd userHash: ${userHash}, expected ${gameState.userHash}`);
            }

            dispatch(gameCreated(gameId));
        } else {
            Raven.captureMessage("Unexpected activateGameEvent");
        }
    };
}

function canPlaceBet(gameState: GameState) {
    const status = gameState.status;
    return status === "ACTIVE";
}

function placeBetEvent(bet: Bet, serverSig: string, userSig: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canPlaceBet(getState().games.gameState)) {
            dispatch(addBet(bet, serverSig, userSig));
        } else {
            Raven.captureMessage("Unexpected placeBetEvent");
        }
    };
}

function canRevealSeed(gameState: GameState) {
    const status = gameState.status;
    return status === "PLACED_BET";
}

function revealSeedEvent(serverSeed: string, userSeed: string, balance: number) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canRevealSeed(getState().games.gameState)) {
            dispatch(revealSeed(serverSeed, userSeed, balance));
        } else {
            Raven.captureMessage("Unexpected revealSeedEvent");
        }
    };
}

export function canUserInitiateConflictEnd(gameState: GameState) {
    const status = gameState.status;
    return status === "ACTIVE" || status === "PLACED_BET" || status === "SERVER_CONFLICT_ENDED";
}

function userInitiateConflictEndEvent(transactionHash: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canUserInitiateConflictEnd(getState().games.gameState)) {
            dispatch(userInitiateConflictEnd(transactionHash));
        } else {
            Raven.captureMessage("Unexpected userInitiateConflictEndEvent");
        }
    };
}

function canUserConflictEnd(gameState: GameState) {
    const status = gameState.status;
    return status === "USER_INITIATED_CONFLICT_END";
}

function userConflictEndEvent(time: Date) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canUserConflictEnd(getState().games.gameState)) {
            dispatch(userConflictEnd(time));
        } else {
            Raven.captureMessage("Unexpected userConflictEndEvent");
        }
    };
}

function canUserAbortConflictEnd(gameState: GameState) {
    const status = gameState.status;
    return status === "USER_INITIATED_CONFLICT_END";
}

function userAbortConflictEndEvent() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canUserAbortConflictEnd(getState().games.gameState)) {
            dispatch(userAbortConflictEnd());
        } else {
            Raven.captureMessage("Unexpected userAbortConflictEndEvent");
        }
    };
}

function canUserInitiateForceEnd(gameState: GameState) {
    const status = gameState.status;
    return status === "USER_CONFLICT_ENDED";
}

function userInitiateForceEndEvent(transactionHash: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canUserInitiateForceEnd(getState().games.gameState)) {
            dispatch(userInitiateForceEnd(transactionHash));
        } else {
            Raven.captureMessage("Unexpected userInitiateForceEndEvent");
        }
    };
}

function canUserForceEnd(gameState: GameState) {
    const status = gameState.status;
    return status === "USER_INITIATED_FORCE_END";
}

function userForceEndEvent() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canUserForceEnd(getState().games.gameState)) {
            dispatch(endedWithReason("END_FORCED_BY_USER"));
        } else {
            Raven.captureMessage("Unexpected userForceEndEvent");
        }
    };
}

function canUserAbortForceEnd(gameState: GameState) {
    const status = gameState.status;
    return status === "USER_INITIATED_FORCE_END";
}

function userAbortForceEndEvent() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canUserAbortForceEnd(getState().games.gameState)) {
            dispatch(userAbortForceEnd());
        } else {
            Raven.captureMessage("Unexpected userAbortForceEndEvent");
        }
    };
}

function canServerConflictEnd(gameState: GameState) {
    const status = gameState.status;
    return (
        status === "CREATING" ||
        status === "USER_CONFLICT_ENDED" ||
        status === "USER_INITIATED_CONFLICT_END" ||
        status === "USER_INITIATED_FORCE_END" ||
        status === "ACTIVE" ||
        status === "PLACED_BET"
    );
}

function serverConflictEndEvent() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (canServerConflictEnd(getState().games.gameState)) {
            dispatch(serverConflictEnd());
        } else {
            Raven.captureMessage("Unexpected serverConflictEndEvent");
        }
    };
}

//
// util functions
//
function isTransactionFailed(receipt: TransactionReceipt) {
    return Number.parseInt(receipt.status, 10) !== 1 && (receipt.status as any) !== true;
}

export const validNetwork = (networkId: number | null) => {
    // only check for null on development
    return networkId !== null && (process.env.NODE_ENV === "development" || networkId === NETWORK_ID);
};

const checkIfEndTransactionFinished = (web3: Web3, transactionHash?: string) => {
    if (!transactionHash) {
        return Promise.resolve(true);
    }

    return getTransactionReceipt(web3, transactionHash).then(receipt => receipt !== null);
};

export function loadContractStateCreatedGame() {
    return async (dispatch: Dispatch, getState: GetState) => {
        const {web3: web3State, games} = getState();
        const {contract} = web3State;
        const {gameState} = games;
        const {gameId} = gameState;
        const {web3, account} = web3State;

        if (!web3 || !account) {
            throw new Error("You need a web3 enabled browser (Metamask)!");
        }

        if (gameId === undefined) {
            throw new Error("Invalid game state!");
        }

        const result = await contract.methods.gameIdGame(gameId).call();
        const status = Number.parseInt(result.status, 10);

        if (status === ContractStatus.ENDED && canEndGame(gameState)) {
            const reasonEnded = await getReasonEnded(web3, contract, gameId);
            return dispatch(endGameEvent(ContractReasonEnded[reasonEnded] as ReasonEnded));
        } else if (status === ContractStatus.USER_INITIATED_END && canUserConflictEnd(gameState)) {
            return dispatch(userConflictEndEvent(new Date()));
        } else if (status === ContractStatus.SERVER_INITIATED_END && canServerConflictEnd(gameState)) {
            return dispatch(serverConflictEndEvent());
        } else {
            return;
        }
    };
}

export function loadContractGameState() {
    return async (dispatch: Dispatch, getState: GetState) => {
        const {web3: web3State, games} = getState();
        const {contract} = web3State;
        const {gameState} = games;
        const {web3, account, networkId} = web3State;

        if (!account || !web3 || !contract || networkId === null) {
            throw new Error("You need a web3 enabled browser (Metamask)!");
        }

        if (!validNetwork(networkId)) {
            throw new Error(`Invalid network! You need to use ${NETWORK_NAME}!`);
        }

        if (gameState.status === "CREATING") {
            // special case as we don't know gameId to read contract state!
            if (!gameState.serverHash) {
                throw new Error("Invalid game state!");
            }

            if (gameState.createTransactionHash) {
                const receipt = await getTransactionReceipt(web3, gameState.createTransactionHash);
                if (!receipt) {
                    // transaction isn't mined
                    return;
                }

                if (isTransactionFailed(receipt)) {
                    return dispatch(endGameEvent("TRANSACTION_FAILURE"));
                }
            }

            const logCreated = await getLogGameCreated(web3, contract, gameState.serverHash);
            if (logCreated) {
                const gameId = logCreated.returnValues.gameId;
                const serverHash = logCreated.returnValues.serverEndHash;
                const userHash = logCreated.returnValues.userEndHash;

                dispatch(activateGameEvent(gameId, serverHash, userHash));
                return dispatch(loadContractStateCreatedGame());
            }
        } else if (gameState.status !== "ENDED") {
            return dispatch(loadContractStateCreatedGame());
        }
    };
}

// TODO: remove???
export function loadServerGameState() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (getState().games.gameState.status === "ENDED") {
            return Promise.resolve();
        }

        return axios
            .get("stateChannel/activeGameState")
            .then(result => {
                const data = result.data;
                const status = data.status;
                const gameId = data.gameId;
                const userHash = data.userHash;

                const gameState = getState().games.gameState;

                if (gameState.status === "CREATING" && status === "ACTIVE" && gameState.userHash === userHash) {
                    dispatch(gameCreated(gameId));
                }
            })
            .catch(error => {
                if (!error.response || error.response.status !== 404) {
                    catchError(error, dispatch);
                }
            });
    };
}

export function loadLocalGameState(address: string) {
    return (dispatch: Dispatch) => {
        if (!isLocalStorageAvailable()) {
            console.warn("No local storage support!");
            return Promise.resolve();
        }

        const storedState = localStorage.getItem(`gameState${address}`);
        if (storedState !== null) {
            const state = JSON.parse(storedState);
            dispatch(restoreState(state.gameState));
            return Promise.resolve();
        }

        return Promise.resolve();
    };
}

export function storeGameState(address: string, gameState: State) {
    if (!isLocalStorageAvailable()) {
        console.warn("No local storage support! Can not store game state!");
        return;
    }
    localStorage.setItem(`gameState${address}`, JSON.stringify({version: STORAGE_VERSION, gameState}));
}

export function syncGameState(address: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        return dispatch(loadLocalGameState(address))
            .then(() => {
                // FIXME: // check if web3 is available
                return dispatch(loadContractGameState());
            })
            .then(() => {
                return dispatch(loadServerGameState());
            })
            .catch((error: Error) => {
                catchError(error, dispatch);
            });
    };
}

// TODO: improve, check contract state???
export function serverActiveGame(gameId: number, serverHash: string, userHash: string) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (status === "ACTIVE") {
            // already active => do nothing
            return;
        }

        dispatch(activateGameEvent(gameId, serverHash, userHash));
    };
}

export function createGame(stake: number, userSeed: string) {
    return async (dispatch: Dispatch, getState: GetState) => {
        const web3State = getState().web3;
        const contract = web3State.contract;
        const account = web3State.account;
        const gameState = getState().games.gameState;
        const status = gameState.status;

        if (!isLocalStorageAvailable()) {
            return Promise.reject(
                new Error("You browser doesn't support sessionStorage/localStorage! Without playing is not possible!")
            );
        }

        if (!validNetwork(web3State.networkId)) {
            return Promise.reject(new Error(`Invalid network! You need to use ${NETWORK_NAME}!`));
        }

        if (!account || !contract || !web3State.web3) {
            return Promise.reject(new Error("You need a web3 enabled browser (Metamask)!"));
        }

        if (!canCreateGame(gameState)) {
            return Promise.reject(new Error(`Invalid game status: ${status}! Can not create game!`));
        }

        const createGame = contract.methods.createGame;
        const hashChain = createHashChain(userSeed);

        try {
            const finished = await checkIfEndTransactionFinished(web3State.web3, gameState.endTransactionHash);
            if (!finished) {
                return Promise.reject(new Error("You need to wait until transaction ending game session is mined!"));
            }

            const response = await axios.post("stateChannel/createGame");
            const data = response.data;
            const serverEndHash = data.serverEndHash;
            const previousGameId = data.previousGameId;
            const createBefore = data.createBefore;
            const signature = data.signature;

            dispatch(createGameEvent(hashChain, serverEndHash, stake, undefined));

            return new Promise((resolve, reject) => {
                createGame(hashChain[0], previousGameId, createBefore, serverEndHash, signature)
                    .send({
                        from: account,
                        value: fromGweiToWei(stake).toString(),
                        gas: 180000,
                    })
                    .on((error: Error) => {
                        reject(error);
                    })
                    .on("transactionHash", (transactionHash: string) => {
                        dispatch(createGameEvent(hashChain, serverEndHash, stake, transactionHash));
                    })
                    .on("receipt", (receipt: TransactionReceipt) => {
                        if (isTransactionFailed(receipt)) {
                            dispatch(endGameEvent("TRANSACTION_FAILURE"));
                            reject(new Error("Create game transaction failed!"));
                        }
                    })
                    .on("confirmation", (num: number, receipt: TransactionReceipt) => {
                        // wait for 3 confirmations
                        if (num === 3) {
                            const event = receipt.events ? receipt.events.LogGameCreated : null;
                            if (isTransactionFailed(receipt) || !event) {
                                dispatch(endGameEvent("TRANSACTION_FAILURE"));
                                reject(new Error("Create game transaction failed!"));
                            } else {
                                const gameId = (event.returnValues as any).gameId;
                                const serverHash = (event.returnValues as any).serverEndHash;
                                const userHash = (event.returnValues as any).userEndHash;
                                if (getState().games.gameState.status !== "ACTIVE") {
                                    dispatch(activateGameEvent(gameId, serverHash, userHash));
                                }
                                resolve();
                            }
                        }
                    })
                    .catch((error: Error) => {
                        reject(error);
                    });
            });
        } catch (error) {
            return Promise.reject(error);
        }
    };
}

export function endGame() {
    return (dispatch: Dispatch, getState: GetState) => {
        const state = getState();
        const gameState = state.games.gameState;
        const account = state.web3.account;
        const web3 = state.web3.web3;
        const networkId = state.web3.networkId;

        // use previous seeds as new hashes seeds (hash chain)
        const serverHash = gameState.serverHash;
        const userHash = gameState.userHash;

        const userAddress = account;
        const gameId = gameState.gameId;
        const roundId = gameState.roundId + 1;
        const balance = gameState.balance;

        if (!getState().account.jwt) {
            return Promise.reject(new Error("You need to login before ending game session!"));
        }

        if (!account || !web3) {
            return Promise.reject(new Error("You need a web3 enabled browser (Metamask)!"));
        }

        if (!validNetwork(networkId)) {
            return Promise.reject(new Error(`Invalid network! You need to use ${NETWORK_NAME}!`));
        }

        if (!canRegularEndGame(gameState)) {
            return Promise.reject(new Error(`Invalid game status ${gameState.status}! Can not end game!`));
        }

        if (!userHash || !serverHash || !userAddress || !gameId) {
            return Promise.reject(new Error("Invalid state!"));
        }

        const bet = {
            roundId: gameState.roundId + 1,
            gameType: 0,
            num: 0,
            value: 0,
            balance,
            serverHash,
            userHash,
            gameId,
        };

        let userSig = "";
        const typedData = createTypedData(bet, CHAIN_ID, CONTRACT_ADDRESS, SIGNATURE_VERSION);
        return signTypedData(web3, account, typedData)
            .then(result => {
                userSig = result;
                return axios.post("stateChannel/endGame", {
                    bet,
                    contractAddress: CONTRACT_ADDRESS,
                    userSig,
                });
            })
            .then(response => {
                const serverSig = response.data.serverSig;

                if (!verifySignature(bet, CHAIN_ID, CONTRACT_ADDRESS, serverSig, SERVER_ADDRESS, SIGNATURE_VERSION)) {
                    return Promise.reject(new Error("Invalid server signature!"));
                }

                const endTransactionHash = response.data.transactionHash;

                dispatch(regularEndGameEvent(roundId, serverHash, userHash, serverSig, userSig, endTransactionHash));

                return Promise.resolve();
            })
            .catch(error => Promise.reject(error));
    };
}

export function conflictEnd() {
    return (dispatch: Dispatch, getState: GetState) => {
        const state = getState();
        const gameState = state.games.gameState;
        const account = state.web3.account;
        const web3 = state.web3.web3;
        const contract = state.web3.contract;
        const networkId = state.web3.networkId;

        const gameId = gameState.gameId;
        const roundId = gameState.roundId;
        const gameType = gameState.gameType;
        const num = gameState.num;
        const oldBalance = gameState.oldBalance;
        const serverSig = gameState.serverSig;
        const contractAddress = contract.options.address;

        if (!web3 || !account || !contract) {
            return Promise.reject(new Error("You need a web3 enabled browser (Metamask)!"));
        }

        if (!validNetwork(networkId)) {
            return Promise.reject(new Error(`Invalid network! You need to use ${NETWORK_NAME}!`));
        }

        if (!canUserInitiateConflictEnd(gameState)) {
            return Promise.reject(new Error(`Invalid game status ${gameState.status}! Can not conflict end!`));
        }

        if (!gameState.serverHash || !gameState.userHash || gameId === undefined) {
            return Promise.reject(new Error("Invalid state!"));
        }

        if (roundId === 0) {
            const cancelActiveGame = contract.methods.userCancelActiveGame;
            return cancelActiveGame(gameId)
                .send({from: account, value: 0, gas: 120000})
                .on("transactionHash", (transactionHash: string) => {
                    dispatch(userInitiateConflictEndEvent(transactionHash));
                })
                .on((error: Error) => {
                    return Promise.reject(error);
                })
                .then((receipt: TransactionReceipt) => {
                    if (isTransactionFailed(receipt)) {
                        dispatch(userAbortConflictEndEvent());
                    } else {
                        dispatch(userConflictEndEvent(new Date()));
                    }
                })
                .catch((error: Error) => {
                    return Promise.reject(error);
                });
        } else {
            let serverHash = keccak(gameState.serverHash);
            let userHash = keccak(gameState.userHash);
            const value = fromGweiToWei(gameState.betValue as number).toString();
            let balance = fromGweiToWei(oldBalance).toString();
            let userSeed = gameState.userHash;

            if (gameState.status === "PLACED_BET") {
                serverHash = gameState.serverHash;
                userHash = gameState.userHash;
                balance = fromGweiToWei(gameState.balance).toString();
                userSeed = gameState.hashChain[roundId];
            }

            const userEndGameConflict = contract.methods.userEndGameConflict;
            return userEndGameConflict(
                roundId,
                gameType,
                num,
                value,
                balance,
                serverHash,
                userHash,
                gameId,
                contractAddress,
                serverSig,
                userSeed
            )
                .send({from: account, gas: 200000})
                .on("transactionHash", (transactionHash: string) => {
                    dispatch(userInitiateConflictEndEvent(transactionHash));
                })
                .on((error: Error) => {
                    return Promise.reject(error);
                })
                .then((receipt: TransactionReceipt) => {
                    if (isTransactionFailed(receipt)) {
                        dispatch(userAbortConflictEnd());
                    } else {
                        dispatch(userConflictEndEvent(new Date()));
                    }
                })
                .catch((error: Error) => {
                    return Promise.reject(error);
                });
        }
    };
}

export function forceEnd() {
    return (dispatch: Dispatch, getState: GetState) => {
        const state = getState();
        const gameState = state.games.gameState;
        const account = state.web3.account;
        const contract = state.web3.contract;
        const networkId = state.web3.networkId;

        const gameId = gameState.gameId;

        if (!account || !contract) {
            return Promise.reject(new Error("You need a web3 enabled browser (Metamask)!"));
        }

        if (!validNetwork(networkId)) {
            return Promise.reject(new Error(`Invalid network! You need to use ${NETWORK_NAME}!`));
        }

        if (!canUserInitiateForceEnd(gameState)) {
            return Promise.reject(new Error(`Invalid game status ${gameState.status}! Can not force end!`));
        }

        const userForceGameEnd = contract.methods.userForceGameEnd;
        return userForceGameEnd(gameId)
            .send({from: account, value: 0, gas: 120000})
            .on("transactionHash", (transactionHash: string) => {
                dispatch(userInitiateForceEndEvent(transactionHash));
            })
            .on("error", (error: Error) => {
                return Promise.reject(error);
            })
            .then((receipt: TransactionReceipt) => {
                if (isTransactionFailed(receipt)) {
                    dispatch(userAbortForceEndEvent());
                } else {
                    dispatch(userForceEndEvent());
                }
            })
            .catch((error: Error) => {
                return Promise.reject(error);
            });
    };
}

async function revealSeedRequest(gameId: number, roundId: number, userSeed: string) {
    return retry(
        () => {
            return axios.post("stateChannel/revealSeed", {
                gameId,
                roundId,
                userSeed,
            });
        },
        {retries: 1, minTimeout: 500}
    );
}

export function requestSeed() {
    return (dispatch: Dispatch, getState: GetState) => {
        const gameState = getState().games.gameState;
        const serverHash = gameState.serverHash;

        if (!getState().account.jwt) {
            return Promise.reject(new Error("You need to login before playing!"));
        }

        if (!canRevealSeed(gameState)) {
            return Promise.reject(new Error(`Invalid game status: ${gameState.status}! Can not place bet!`));
        }

        const betValue = gameState.betValue;
        const userSeed = gameState.hashChain[gameState.roundId];

        if (betValue === undefined || gameState.gameId === undefined || !serverHash) {
            return Promise.reject(new Error("Invalid game state!"));
        }

        return revealSeedRequest(gameState.gameId, gameState.roundId, userSeed)
            .then(response => {
                const serverSeed = response.data.serverSeed;
                const newServerBalance = response.data.balance;

                if (!verifySeed(serverSeed, serverHash)) {
                    return Promise.reject(new Error("Invalid server seed!"));
                }

                const newuserBalance = calcNewBalance(
                    gameState.gameType,
                    gameState.num,
                    betValue,
                    serverSeed,
                    userSeed,
                    gameState.balance
                );

                if (newServerBalance !== newuserBalance) {
                    return Promise.reject(
                        new Error(`Invalid server balance! Expected ${newuserBalance} got ${newServerBalance}`)
                    );
                }

                return Promise.resolve(dispatch(revealSeedEvent(serverSeed, userSeed, newServerBalance)));
            })
            .catch(error => {
                return Promise.reject(error);
            });
    };
}

export function placeBet(num: number, betValue: number, gameType: number) {
    return (dispatch: Dispatch, getState: GetState): Promise<{num: number; won: boolean}> => {
        const gameState = getState().games.gameState;
        const web3State = getState().web3;
        const {account, web3} = web3State;

        // use previous seeds as new hashes seeds (hash chain)
        const serverHash = gameState.serverHash;
        const userHash = gameState.userHash;

        const roundId = gameState.roundId + 1;
        const gameId = gameState.gameId;
        const balance = gameState.balance;
        const stake = gameState.stake;

        if (!getState().account.jwt) {
            return Promise.reject(new Error("You need to login before playing!"));
        }

        if (!web3 || !account) {
            return Promise.reject(new Error("You need a web3 enabled browser (Metamask)!"));
        }

        if (!validNetwork(web3State.networkId)) {
            return Promise.reject(new Error(`Invalid network! You need to use ${NETWORK_NAME}!`));
        }

        if (!canPlaceBet(gameState)) {
            return Promise.reject(new Error(`Invalid game status: ${gameState.status}! Can not place bet!`));
        }

        if (!serverHash || !userHash || gameId === undefined) {
            return Promise.reject(new Error("Invalid game state!"));
        }

        if (betValue > stake + balance) {
            return Promise.reject(new Error("Invalid bet value: Funds to low!"));
        }

        let userSig = "";
        let userSeed = "";

        const bet = {
            roundId,
            gameType,
            num,
            value: betValue,
            balance,
            serverHash,
            userHash,
            gameId,
        };

        const typedData = createTypedData(bet, CHAIN_ID, CONTRACT_ADDRESS, SIGNATURE_VERSION);

        return signTypedData(web3, account, typedData)
            .then(result => {
                userSig = result;
                return axios.post("stateChannel/placeBet", {
                    bet,
                    contractAddress: CONTRACT_ADDRESS,
                    userSig,
                });
            })
            .then(response => {
                const serverSig = response.data.serverSig;

                if (!verifySignature(bet, CHAIN_ID, CONTRACT_ADDRESS, serverSig, SERVER_ADDRESS, SIGNATURE_VERSION)) {
                    return Promise.reject(new Error("Error placing bet: Invalid server signature!"));
                }

                dispatch(placeBetEvent(bet, serverSig, userSig));

                userSeed = gameState.hashChain[roundId];

                return revealSeedRequest(gameId, roundId, userSeed);
            })
            .then(response => {
                // TODO: Replace with reveal seed!!!
                const serverSeed = response.data.serverSeed;
                const newServerBalance = response.data.balance;

                if (!verifySeed(serverSeed, serverHash)) {
                    return Promise.reject(new Error("Invalid server seed!"));
                }

                const resNum = calcResultNumber(gameType, serverSeed, userSeed, num);
                const userProfit = calcUserProfit(gameType, num, betValue, resNum);
                const newuserBalance = balance + userProfit;

                if (newServerBalance !== newuserBalance) {
                    return Promise.reject(
                        new Error(`Invalid server balance! Expected ${newuserBalance} got ${newServerBalance}`)
                    );
                }

                dispatch(revealSeedEvent(serverSeed, userSeed, newServerBalance));

                return Promise.resolve({num: resNum, won: userProfit > 0});
            })
            .catch(error => {
                return Promise.reject(error);
            });
    };
}
