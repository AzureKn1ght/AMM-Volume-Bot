/*
- RON Compound - 
This strategy involves claiming farm reward (RON tokens) and swapping the rewards to proportional RON and WETH to create LP tokens and deposit the LP tokens into the farm on the Katana DEX for RON rewards, thereby compounding the daily RON yields. 

URL: https://katana.roninchain.com/#/farm
*/

// Import required node modules
const scheduler = require("node-schedule");
const nodemailer = require("nodemailer");
const { ethers } = require("ethers");
const figlet = require("figlet");
require("dotenv").config();
const fs = require("fs");

// Import environment variables
const WALLET_ADDRESS = process.env.USER_ADDRESS;
const PRIV_KEY = process.env.USER_PRIVATE_KEY;
const USER_AGENT = process.env.USER_AGENT;
const RPC_URL = process.env.RONIN_RPC;

// State storage object for trades
var report = [];
var trades = {
  previousTrade: "",
  nextTrade: "",
};

// Contract ABIs
const erc20ABI = ["function balanceOf(address) view returns (uint256)"];
const lpABI = require("./ABI/liquidityPoolABI");
const tradesABI = require("./ABI/stakingABI");
const katanaABI = require("./ABI/katanaABI");
const ronStakerABI = tradesABI;

// All relevant addresses needed
const WETH = "0xc99a6a985ed2cac1ef41640596c5a5f9f4e19ef5";
const LPtoken = "0x2ecb08f87f075b5769fe543d0e52e40140575ea7";
const katanaAdd = "0x7d0556d55ca1a92708681e2e231733ebd922597d";

// Ethers vars for web3 connections
var wallet, provider, uniswapRouter;

// Main Function
const main = async () => {
  try {
    console.log(
      figlet.textSync("AMMTrade", {
        font: "Standard",
        horizontalLayout: "default",
        verticalLayout: "default",
        width: 80,
        whitespaceBreak: true,
      })
    );
    let tradesExists = false;

    // check if trades file exists
    if (!fs.existsSync("./next.json")) await storeData();

    // get stored values from file
    const storedData = JSON.parse(fs.readFileSync("./next.json"));

    // not first launch, check data
    if ("nextTrade" in storedData) {
      const nextTrade = new Date(storedData.nextTrade);

      // restore trades schedule
      if (nextTrade > new Date()) {
        console.log("Restored Trade: " + nextTrade);
        scheduler.scheduleJob(nextTrade, AMMTrade);
        tradesExists = true;
      }
    }

    //no previous launch
    if (!tradesExists) {
      AMMTrade();
    }
  } catch (error) {
    console.error(error);
  }
};

// Ethers vars connect
const connect = async () => {
  const connection = {
    url: RPC_URL,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-Forwarded-For": randomIP(),
      "X-Real-Ip": randomIP(),
    },
  };

  // new RPC connection
  provider = new ethers.providers.JsonRpcProvider(connection);
  console.log(connection.headers["X-Forwarded-For"]);
  console.log(connection.headers["X-Real-Ip"]);
  wallet = new ethers.Wallet(PRIV_KEY, provider);

  // uniswap router contract
  uniswapRouter = new ethers.Contract(katanaAdd, katanaABI, wallet);

  // connection established
  const balance = await provider.getBalance(WALLET_ADDRESS);
  console.log("ETH Balance: " + ethers.utils.formatEther(balance));
  console.log("--> connected\n");
};

// Ethers vars disconnect
const disconnect = () => {
  wallet = null;
  provider = null;
  uniswapRouter = null;
  console.log("-disconnected-\n");
};

// AMM Trading Function
const AMMTrade = async () => {
  console.log("\n--- AMMTrade Start ---");
  report.push("--- AMMTrade Report ---");
  try {
    await connect();

    // call the trading function here
    // remember to try 3 times on error

    // function status
    const compound = {
      claimRONrewards: ronBalance > 0,
      addRewardstoLP: LPtokenBal > 0,
      stakeLPintoFarm: staked,
      // just report on the trade status
    };

    report.push(compound);
  } catch (error) {
    report.push("AMMTrade failed!");
    report.push(error);

    // try again later
    console.error(error);
    scheduleNext(new Date());
  }

  // send status update report
  report.push({ ...trades });
  sendReport(report);
  report = [];

  return disconnect();
};

// Swaps Function (assumes 18 decimals on input amountIn)
const swapExactTokensForETH = async (amountIn, path) => {
  try {
    // get amount out from uniswap router
    const amtInFormatted = ethers.utils.formatEther(amountIn);
    const result = await uniswapRouter.getAmountsOut(amountIn, path);
    const expectedAmt = result[result.length - 1];
    const deadline = Date.now() + 1000 * 60 * 8;

    // calculate 1% slippage for ERC20 tokens
    const amountOutMin = expectedAmt.sub(expectedAmt.div(100));
    const amountOut = ethers.utils.formatEther(amountOutMin);

    // console log the details
    console.log("Swapping Tokens...");
    console.log("Amount In: " + amtInFormatted);
    console.log("Amount Out: " + amountOut);
    let swap;

    // execute the swap using the appropriate function
    swap = await uniswapRouter.swapExactTokensForETH(
      amountIn,
      amountOutMin,
      path,
      WALLET_ADDRESS,
      deadline
    );

    // wait for transaction to complete
    const receipt = await swap.wait();
    if (receipt) {
      console.log("TOKEN SWAP SUCCESSFUL");
      return true;
    }
  } catch (error) {
    console.error(error);
  }
  return false;
};

// Send Report Function
const sendReport = (report) => {
  // get the formatted date
  const today = todayDate();
  console.log(report);

  // configure email server
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    secure: false,
    port: "587",
    tls: {
      ciphers: "SSLv3",
      rejectUnauthorized: false,
    },
    auth: {
      user: process.env.EMAIL_ADDR,
      pass: process.env.EMAIL_PW,
    },
    debug: true,
    logger: true,
  });

  // setup mail params
  const mailOptions = {
    from: process.env.EMAIL_ADDR,
    to: process.env.RECIPIENT,
    subject: "Trade Report: " + today,
    text: JSON.stringify(report, null, 2),
  };

  // send the email message
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

// Current Date Function
const todayDate = () => {
  const today = new Date();
  return today.toLocaleString("en-GB", { timeZone: "Asia/Singapore" });
};

// Job Scheduler Function
const scheduleNext = async (nextDate) => {
  // apply delay
  await delay();

  // set next job to be 12hrs from now
  nextDate.setHours(nextDate.getHours() + 12);
  trades.nextTrade = nextDate.toString();
  console.log("Next Trade: ", nextDate);

  // schedule next restake
  scheduler.scheduleJob(nextDate, AMMTrade);
  storeData();
  return;
};

// Data Storage Function
const storeData = async () => {
  const data = JSON.stringify(trades);
  fs.writeFile("./next.json", data, (err) => {
    if (err) {
      console.error(err);
    } else {
      console.log("Data stored:\n", trades);
    }
  });
};

// Random IP Function
const randomIP = () => {
  const A = getRandomNum(100, 255);
  const B = getRandomNum(0, 255);
  const C = getRandomNum(0, 255);
  const D = getRandomNum(0, 255);
  return `${A}.${B}.${C}.${D}`;
};

// Generate random num Function
const getRandomNum = (min, max) => {
  try {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  } catch (error) {
    console.error(error);
  }
  return max;
};

// Random Time Delay Function
const delay = () => {
  const ms = getRandomNum(2971, 4723);
  console.log(`delay(${ms})`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

main();
