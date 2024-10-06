const Server = require("./http/Server");
const net = require("net");

const config = require("./config.json");

// HTTP
const server = new Server();
const { router: app } = server;

app.any("*", (req, res, next) => {
    if (config.authorization && req.headers.authorization !== config.authorization) return res.sendStatus(401);
    return next();
});

app.get("/status", (req, res) => {
    sendSmartHomeProtocolCommand({ system: { get_sysinfo: null } }).then(commandRes => {
        if (!commandRes?.system?.get_sysinfo) return res.sendStatus(500);
        res.send(commandRes.system.get_sysinfo.relay_state ? "on" : "off");
    }).catch(err => {
        res.sendStatus(500);
    });
});

app.post("/on", (req, res) => {
    sendSmartHomeProtocolCommand({ system: { set_relay_state: { state: 1 } } }).then(commandRes => {
        res.send("Turned Derek on! :)))");
    }).catch(err => {
        res.sendStatus(500);
    });
});

app.post("/off", (req, res) => {
    sendSmartHomeProtocolCommand({ system: { set_relay_state: { state: 0 } } }).then(commandRes => {
        res.send("Turned Derek off :(");
    }).catch(err => {
        res.sendStatus(500);
    });
});

app.any("*", (req, res) => res.sendStatus(404));

server.listen(config.port, () => console.log(`Listening at :${config.port}`));

// Smart Home protocol proxy
if (config.smartHomeProtocolProxy) {
    const smartHomeProtocolServer = net.createServer();

    smartHomeProtocolServer.on("connection", socket => {
        const connection = net.createConnection({ host: config.plugIp, port: 9999 });

        connection.on("data", data => !socket.write(data) ? connection.pause() : null);
        connection.on("close", () => socket.end());
        connection.on("end", () => socket.end());
        connection.on("drain", () => socket.resume());
        connection.on("error", () => { });

        socket.on("data", data => !connection.write(data) ? socket.pause() : null);
        socket.on("close", () => connection.end());
        socket.on("end", () => connection.end());
        socket.on("drain", () => connection.resume());
        socket.on("error", () => { });
    });

    smartHomeProtocolServer.listen(9999, () => console.log("Smart Home protocol proxy listening at :9999"));
}

// Smart Home protocol
// https://github.com/softScheck/tplink-smartplug
// Commands: https://raw.githubusercontent.com/softScheck/tplink-smartplug/refs/heads/master/tplink-smarthome-commands.txt
function sendSmartHomeProtocolCommand(command) {
    return new Promise((resolve, reject) => {
        const connection = net.createConnection({ host: config.plugIp, port: 9999 });
        connection.write(smartHomeProtocolEncrypt(JSON.stringify(command)));
        let data;
        connection.on("data", i => data = Buffer.concat(data ? [data, i] : [i]));
        connection.on("end", () => resolve(JSON.parse(smartHomeProtocolDecrypt(data))));
        connection.on("error", err => reject(err));
    });
}

function smartHomeProtocolEncrypt(string) {
    let key = 171;
    const length = string.length;
    const result = new Uint8Array(4 + length);

    result[0] = (length >> 24) & 0xFF;
    result[1] = (length >> 16) & 0xFF;
    result[2] = (length >> 8) & 0xFF;
    result[3] = length & 0xFF;

    for (let i = 0; i < string.length; i++) {
        const a = key ^ string.charCodeAt(i);
        key = a;
        result[4 + i] = a;
    }

    return result;
}

function smartHomeProtocolDecrypt(array) {
    let key = 171;
    let result = "";

    for (let i = 4; i < array.length; i++) {
        const a = key ^ array[i];
        key = array[i];
        result += String.fromCharCode(a);
    }

    return result;
}