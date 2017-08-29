#!/usr/bin/gjs

const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const GIRepository = imports.gi.GIRepository;
const System = imports.system;

const SEPARATOR = '='
const FLAG_USE_SSL = 4
const FLAG_AUTO_CONNECT = 8

function uniq(a) {
    return a.sort().filter(function(item, pos, ary) {
        return !pos || item != ary[pos - 1];
    })
}

function flagMatches(flag, bitmask) {
    if (flag == NaN)
        return false;
    return (flag & bitmask);
}

function parseSection(section) {
    // Split into lines, and stuff into a dict
    let keys = {}
    let lines = section.split('\n');
    let array;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].length <= 2 || lines[i][1] != '=') {
            //log('Ignoring ' + lines[i]);
            continue;
        }
        let key = lines[i][0];
        // Ignore keys that have already been set
        if (key in keys)
            continue;
        let value = lines[i].substring(2);
        keys[key] = value;
    }

    // Ignore if there's no server line
    if (!keys['S'])
        return null;

    let name = ('N' in keys) ? keys['N'] : keys['S'];

    // Ignore if the server isn't autoconnect
    if (!flagMatches(Number(keys['F']), FLAG_AUTO_CONNECT)) {
        //log('Server ' + name + ' is not autoconnect, ignoring');
        return null;
    }

    let useSSL = flagMatches(Number(keys['F']), FLAG_USE_SSL);

    let serverIP, port;
    if (keys['S'].indexOf('/') == -1) {
        serverIP = keys['S'];
    } else {
        serverIP = keys['S'].split('/')[0];
        let portSection = keys['S'].split('/')[1];
        if (portSection[0] == '+') {
            useSSL = true;
            port = portSection.substring(1);
        } else {
            port = portSection;
        }
    }


    let server = {};
    server.networkName = name;
    server.serverAddress = serverIP;
    server.secureConnection = useSSL;

    server.nickname = keys['I'];
    server.realName = keys['R'];
    //FIXME ignore accounts without join?
    if (keys['J']) {
        server.rooms = keys['J'].split(',');
        server.rooms = uniq(server.rooms);
    }
    server.nickservPassword = keys['B'];
    server.serverPassword = keys['P'];
    server.serverPort = port;
    server.nickServ = keys['B'];

    print ('Parsed auto-connect server ' + name);

    return server;
}

function parseConfiguration(data) {
    // Split into sections and parse each one
    let sections = String(data).split('\n\n');
    let nickUsage = [];
    let servers = [];
    for (let i = 0; i < sections.length; i++) {
        let server = parseSection(sections[i]);
        if (server) {
            if (!(server.nickname in nickUsage))
                nickUsage[server.nickname] = 0;
            server.accountNum = nickUsage[server.nickname]++;
            servers.push(server);
        }
    }

    return servers
}

function writeTelepathyConfig(data) {
    let str = '# Telepathy accounts\n\n';
    let nickUsage = [];

    for (let i = 0; i < data.length; i++) {
        let server = data[i];

        str += "[idle/irc/" + server.nickname + server.accountNum + ']\n';
        str += 'manager=idle\n';
        str += 'protocol=irc\n';
        str += 'DisplayName=' + server.networkName + '\n';
        str += 'Enabled=true\n';
        if (server.nickname != GLib.get_user_name())
            str += 'param-username=' + server.nickname + '\n';
        str += 'Service=' + server.networkName.replace(/[^\w]/gi, '_').toLowerCase()  + '\n';
        str += 'param-account=' + server.nickname + '\n';
        str += 'param-server=' + server.serverAddress + '\n';
        str += 'param-use-ssl=' + (server.secureConnection ? 'true' : 'false') + '\n';
        if (server.serverPort != undefined)
            str += 'param-port=' + server.serverPort + '\n';
        str += '\n';
    }

    return str;
}

function getSavedChannedList(data) {
    let list = [];

    for (let i = 0; i < data.length; i++) {
        let server = data[i];

        let accountPath = "/org/freedesktop/Telepathy/Account/idle/irc/" + server.nickname + server.accountNum;
        if (server.rooms != undefined) {
            for (let idx in server.rooms) {
                list.push({
                    account: new GLib.Variant('s', accountPath),
                    channel: new GLib.Variant('s', server.rooms[idx])
                });
            }
        }
    }

    return list;
}

function main(ARGV) {
    // Argument parsing
    let input, output, testOutput;
    if (ARGV.length >= 1)
        input = ARGV[0];
    else
        input = GLib.get_home_dir() + '/.xchat-gnome/servlist_.conf'; //FIXME look in more places

    testOutput = false;
    if (ARGV.length == 2) {
        output = ARGV[1] + '/accounts.cfg';
        testOutput = true;
    } else
        output = GLib.get_user_data_dir() + '/telepathy/mission-control/accounts.cfg'

    let inputFile = Gio.File.new_for_path(input);
    let outputFile = Gio.File.new_for_path(output);

    print ("Processing " + inputFile.get_path() + " to " + outputFile.get_path());

    // Check that output doesn't already exist
    if (GLib.file_test(output, GLib.FileTest.EXISTS)) {
        print ('Output file ' + output + ' already exists, aborting.');
        return 1;
    }

    // Parse the configuration
    let success, data, servers;
    try {
        [success, data, ] = inputFile.load_contents(null);
        servers = parseConfiguration(data);
    } catch(e) {
        log('Failed to load configuration file: ' + e.message);
        return 1;
    }
    print ('Parsed ' + servers.length + ' servers');

    // Write the telepathy configuration
    let str;
    try {
        str = writeTelepathyConfig(servers);
        outputFile.replace_contents(str, null, false, Gio.FileCreateFlags.NONE, null);
    } catch(e) {
        log('Failed to write Telepathy config: ' + e.message);
        return 1;
    }

    // Write the Polari channels configuration
    try {
        let list = getSavedChannedList(servers);
        let variant = GLib.Variant.new('aa{sv}', list);
        if (!testOutput) {
            let settings = new Gio.Settings({ schema_id: 'org.gnome.Polari' });
            settings.set_value('saved-channel-list', variant);
        } else {
            let settingsOutput = ARGV[1] + '/settings.txt';
            let settingsOutputFile = Gio.File.new_for_path(settingsOutput);
            settingsOutputFile.replace_contents(variant.print(true), null, false, Gio.FileCreateFlags.NONE, null);
        }
    } catch(e) {
        log("Failed to set 'saved-channel-list' settings: " + e.message);
        return 1;
    }
}

main(ARGV);
