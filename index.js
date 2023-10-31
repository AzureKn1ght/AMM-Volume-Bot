/*
- AMM Volume Bot - 
This is a simple AMM volumizer bot that automatically trades tokens on decentralized exchanges (DEX) so that price values are registered and available on a regular basis. Most DEX APIs will not update price data if there are no trades happening for more than a day. This bot aims to solve that problem by automatically executing a small trade at regular intervals. Prerequisite is that you will need to have some of your ERC20 tokens in your wallet, and you must first give token approval to the AMM router of the DEX for token spending. Once the bot is operational, it will sell 1 token for the native coin every 12hrs. All values are configurable in the code. :)  

Git: https://github.com/AzureKn1ght/AMM-Volume-Bot
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
const RPC_URL = process.env.RPC_URL;

// Storage obj
var report = [];
var trades = {
  previousTrade: "",
  nextTrade: "",
};

// Contract ABI (please grant ERC20 approvals)
const uniswapABI = require("./ABI/uniswapABI");
const TRADE_AMT = "1.0";

// All relevant addresses needed (is WBNB and PCS on BSC)
const KTP = "0xc6C0C0f54a394931a5b224c8b53406633e35eeE7";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const WETH = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const uniswapAdr = "0x10ED43C718714eb63d5aA57B78B54704E256024E";

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
  uniswapRouter = new ethers.Contract(uniswapAdr, uniswapABI, wallet);

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
  report.push(`By: ${WALLET_ADDRESS}`);
  try {
    await connect();
    const result = await sellTokensCreateVolume();

    // update on status
    report.push(result);
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

// AMM Volume Trading Function
const sellTokensCreateVolume = async (tries = 1.0) => {
  try {
    // limit to maximum 3 tries
    if (tries > 3) return false;
    console.log(`Try #${tries}...`);

    // prepare the variables needed for the trade
    const amt = ethers.utils.parseEther(TRADE_AMT);
    const path = [KTP, USDT, WETH];

    // execute the swapping function record result
    const result = await swapExactTokensForETH(amt, path);

    // succeeded
    if (result) {
      // get the remaining balance of the current wallet
      const u = await provider.getBalance(WALLET_ADDRESS);
      const balance = ethers.utils.formatEther(u);
      console.log(`Balance: ${balance} ETH`);

      // successful
      const success = {
        balance: balance,
        success: true,
        trade: result,
      };

      return success;
    } else throw new Error();
  } catch (error) {
    console.log("Attempt Failed!");
    console.log("retrying...");
    console.error(error);

    // fail, increment try count and retry again
    return await sellTokensCreateVolume(++tries);
  }
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

      // return data
      const data = {
        amountIn: amtInFormatted,
        amountOutMin: amountOut,
        path: path,
        wallet: WALLET_ADDRESS,
        receipt: receipt,
      };
      return data;
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
