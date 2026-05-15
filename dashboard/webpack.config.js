const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require("terser-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");


module.exports = (env, argv) => {
    const isProd = argv.mode === "production";
    const cssLoader = isProd ? MiniCssExtractPlugin.loader : "style-loader";
    return {
    mode: isProd ? "production" : "development",
    entry: {
        index: "./src/Index.jsx",
    },
    optimization: isProd
        ? {
              minimize: true,
              minimizer: [
                  new TerserPlugin(),
                  new CssMinimizerPlugin({
                      minimizerOptions: {
                          preset: ["default", { svgo: false }],
                      },
                  }),
              ],
          }
        : undefined,

    // stats: {
    //     warnings: false,  // Disable warnings
    // },
    // infrastructureLogging: {
    //     level: 'none',  // This will suppress all warnings and logs
    // },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: "babel-loader",
            },
            {
                test: /\.css$/i,
                use: [cssLoader, 'css-loader'],
            },
            {
                test: /\.scss$/,
                use: [
                    cssLoader,
                    "css-loader",
                    {
                        loader: "sass-loader",
                        options: {
                            sassOptions: {
                                silenceDeprecations: [
                                    "import",
                                    "global-builtin",
                                    "legacy-js-api",
                                    "if-function",
                                ],
                            },
                        },
                    },
                ],
            },
        ],
    },
    resolve: {
        extensions: ['.js', '.jsx'],
        fallback: {
            fs: false,
            crypto: false,
            path: false
        }
    },
    plugins: [
        ...(isProd ? [new MiniCssExtractPlugin({ filename: "[name].css" })] : []),
        new HtmlWebpackPlugin({
            template: "./public/base.html",
            filename: "index.html",
            chunks: ['index']  // Specify the chunk for the main website
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: './index.db.br', to: 'index.db.br' },
                { from: './node_modules/sql.js/dist/sql-wasm.wasm', to: 'sql-wasm.wasm' },
                { from: './public/favicon-32x32.png', to: 'favicon-32x32.png' }
            ]
        }),
    ],
    devServer: {
        static: path.resolve(__dirname, "dist"),
        port: 3000,
    },
    };
};