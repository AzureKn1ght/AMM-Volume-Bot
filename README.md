# AMM Volume Bot
[![UNISWAP](https://www.bitkub.com/static/images/buy-sell/coin_header/42-Uniswap-H.svg)]

AMM Volume Bot 

## ENV Variables 
You will need to create a file called *.env* in the root directory, copy the text in *.env.example* and fill in the variables. 
If you want to use the emailer with gmail, then you will need [Google App Passwords](https://support.google.com/accounts/answer/185833?hl=en). 

## How to Run
You could run it on your desktop just using [Node.js](https://github.com/nodejs/node) in your terminal. However, on a production environment, it is recommended to use something like [PM2](https://github.com/Unitech/pm2) to run the processes to ensure robust uptime and management. 
```
npm install
pm2 start index.js -n "VOL"
pm2 save

```
**Donate:** 0xbaee15e7905874ea5e592efee19b2d0082d538b8
