const path = require("path");

const outputFolder = path.resolve(
  __dirname,
  "../../build/dist/client/Data/Platform/Plugins",
);
const outputFilename = "auth-ui.js";
const entryPoint = "./client/index.ts";

module.exports = {
  target: "node",
  mode: "development",
  devtool: "inline-source-map",
  entry: {
    main: entryPoint,
  },
  output: {
    path: outputFolder,
    filename: outputFilename,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  externals: {
    "@skyrim-platform/skyrim-platform": ["skyrimPlatform"],
    skyrimPlatform: ["skyrimPlatform"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: {
          configFile: "tsconfig.json",
        },
      },
    ],
  },
};
