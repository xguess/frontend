const webpack = require('webpack');
const merge = require('webpack-merge');

const common = require('./common');


const contractAddress = "0xd22f70c9eace8873a28a61bd0338f82fd71ad636";
const serverAddress = "0xa8d5f39f3ccd4795b0e38feacb4f2ee22486ca44";
const apiUrl = 'http://localhost:5000/api';
const websocketUrl = 'http://localhost:5001';
const chainId = 123456789;


module.exports = merge(common, {
    mode: 'development',
    devtool: 'inline-source-map',
    plugins: [
        new webpack.DefinePlugin({
            'process.env': {
                'NODE_ENV': JSON.stringify('development'),
                'SENTRY_LOGGING': false,
                'REDUX_LOGGING': true,
                'CONTRACT_ADDRESS': JSON.stringify(contractAddress),
                'SERVER_ADDRESS': JSON.stringify(serverAddress),
                'API_URL': JSON.stringify(apiUrl),
                'SOCKET_URL': JSON.stringify(websocketUrl),
                'CHAIN_ID': JSON.stringify(chainId)
            }
        })
    ],
});
