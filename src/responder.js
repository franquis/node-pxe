var EventEmitter = require('events').EventEmitter;
var util = require('util');
var dgram = require('dgram');
var V4Address = require('ip-address').Address4;
var protocol = require('dhcpjs').Protocol;


function Responder(options) {
    if (options) {
        if (typeof(options) !== 'object')
            throw new TypeError('options must be an object');
    } else {
        options = {};
    }

    var self = this;
    EventEmitter.call(this, options);

    this.socket = dgram.createSocket('udp4');
    this.socket.on('error', function(err) { console.log("Responder err", err);});
}

util.inherits(Responder, EventEmitter);
module.exports = Responder;

Responder.prototype.bind = function() {
	var _this = this;
	
   this.socket.bind({host: "192.168.33.1"}, function (){
   		_this.socket.setTTL(1);
		_this.socket.setBroadcast(true);
		console.log("Responder binded");
   });
}

Responder.prototype.close = function (){
	this.socket.close();
	console.log("Responder closed");
}

Responder.prototype.broadcastPacket = function(pkt, cb) {
    var port = 68;
    var host = '255.255.255.255';
    this.socket.send(pkt, 0, pkt.length, port, host, cb);
}

Responder.prototype.createPacket = function(pkt) {
    if (!('xid' in pkt))
        throw new Error('pkt.xid required');

    var ci = new Buffer(('ciaddr' in pkt) ?
        new V4Address(pkt.ciaddr).toArray() : [0, 0, 0, 0]);
    var yi = new Buffer(('yiaddr' in pkt) ?
        new V4Address(pkt.yiaddr).toArray() : [0, 0, 0, 0]);
    var si = new Buffer(('siaddr' in pkt) ?
        new V4Address(pkt.siaddr).toArray() : [0, 0, 0, 0]);
    var gi = new Buffer(('giaddr' in pkt) ?
        new V4Address(pkt.giaddr).toArray() : [0, 0, 0, 0]);

    if (!('chaddr' in pkt))
        throw new Error('pkt.chaddr required');
    var hw = new Buffer(pkt.chaddr.split(':').map(function(part) {
        return parseInt(part, 16);
    }));
    if (hw.length !== 6)
        throw new Error('pkt.chaddr malformed, only ' + hw.length + ' bytes');

    var p = new Buffer(1500);
    var i = 0;

    p.writeUInt8(pkt.op,    i++);
    p.writeUInt8(pkt.htype, i++);
    p.writeUInt8(pkt.hlen,  i++);
    p.writeUInt8(pkt.hops,  i++);
    p.writeUInt32BE(pkt.xid,   i); i += 4;
    p.writeUInt16BE(pkt.secs,  i); i += 2;
    p.writeUInt16BE(pkt.flags, i); i += 2;
    ci.copy(p, i); i += ci.length;
    yi.copy(p, i); i += yi.length;
    si.copy(p, i); i += si.length;
    gi.copy(p, i); i += gi.length;
    hw.copy(p, i); i += hw.length;
    p.fill(0, i, i + 10); i += 10; // hw address padding
    p.fill(0, i, i + 192); i += 192;
    p.writeUInt32BE(0x63825363, i); i += 4;

    if (pkt.options && 'requestedIpAddress' in pkt.options) {
        p.writeUInt8(50, i++); // option 50
        var requestedIpAddress = new Buffer(
            new v4.Address(pkt.options.requestedIpAddress).toArray());
        p.writeUInt8(requestedIpAddress.length, i++);
        requestedIpAddress.copy(p, i); i += requestedIpAddress.length;
    }
    if (pkt.options && 'dhcpMessageType' in pkt.options) {
        p.writeUInt8(53, i++); // option 53
        p.writeUInt8(1, i++);  // length
        p.writeUInt8(pkt.options.dhcpMessageType.value, i++);
    }
    if (pkt.options && 'serverIdentifier' in pkt.options) {
        p.writeUInt8(54, i++); // option 54
        var serverIdentifier = new Buffer(
            new v4.Address(pkt.options.serverIdentifier).toArray());
        p.writeUInt8(serverIdentifier.length, i++);
        serverIdentifier.copy(p, i); i += serverIdentifier.length;
    }
    if (pkt.options && 'parameterRequestList' in pkt.options) {
        p.writeUInt8(55, i++); // option 55
        var parameterRequestList = new Buffer(pkt.options.parameterRequestList);
        if (parameterRequestList.length > 16)
            throw new Error('pkt.options.parameterRequestList malformed');
        p.writeUInt8(parameterRequestList.length, i++);
        parameterRequestList.copy(p, i); i += parameterRequestList.length;
    }
    if (pkt.options && 'clientIdentifier' in pkt.options) {
        var clientIdentifier = new Buffer(pkt.options.clientIdentifier);
        var optionLength = 1 + clientIdentifier.length;
        if (optionLength > 0xff)
            throw new Error('pkt.options.clientIdentifier malformed');
        p.writeUInt8(61, i++);           // option 61
        p.writeUInt8(optionLength, i++); // length
        p.writeUInt8(0, i++);            // hardware type 0
        clientIdentifier.copy(p, i); i += clientIdentifier.length;
    }

    // option 255 - end
    p.writeUInt8(0xff, i++);

    // padding
    if ((i % 2) > 0) {
        p.writeUInt8(0, i++);
    } else {
        p.writeUInt16BE(0, i++);
    }

    var remaining = 300 - i;
    if (remaining) {
        p.fill(0, i, i + remaining); i+= remaining;
    }

    return p.slice(0, i);
}

Responder.prototype.createOfferPacket = function (user){

	var pkt = {
		op: 	protocol.BOOTPMessageType.BOOTPREPLY.value,
		htype: 	0x01,
        hlen:   0x06,
        hops:   0x00,
        xid:    0x00000000,
        secs:   0x0000,
        flags:  0x0000,
        ciaddr: '0.0.0.0',
        yiaddr: '192.168.33.3',
        siaddr: '192.168.33.1',
        giaddr: '0.0.0.0',
    };
    
    pkt.xid = user.xid;
    pkt.chaddr = user.chaddr;
    pkt.options = user.options;
    
    return Responder.prototype.createPacket(pkt);
}