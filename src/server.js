var util = require('util');
var clc = require('cli-color');
var tftp = require('tftp');
var dhcpjs = require('dhcpjs');
var Protocol = dhcpjs.Protocol;
var Responder = require('./responder');
var dhcp_server = dhcpjs.createServer();
const dgram = require('dgram');
// DEV
var virtualbox = require('virtualbox');
var exec = require('child_process').exec;

// Colors
var error = clc.red.bold;
var succ = clc.green.bold;
var warn = clc.yellow;
var notice = clc.blue;


var tftp_server = tftp.createServer({
	host: "192.168.33.1",
	port: 1234,
	root: "tftp/",
	denyPUT: true
});

dhcp_server.on('message', function(m) {
	try {
		var vendor = m.options.vendorClassIdentifier.split(':');
	} catch(e){
		var vendor = [];
	}
	
	var mType = m.op.value;

	if(mType === Protocol.DHCPMessageType.DHCPDISCOVER.value && vendor[0] == "PXEClient"){
		var resp = new Responder();
		resp.bind();
		console.log(notice('PXEClient DHCPDISCOVER', m.xid));
		console.log(util.inspect(m, false, 3));
		var pkt = resp.createOfferPacket({
			xid: m.xid,
			chaddr: m.chaddr.address,
			dhcpMessageType: Protocol.DHCPMessageType.DHCPOFFER.value
		});
		
		resp.broadcastPacket(pkt, function (err){
			if(err){
				console.log(error(err));
			} else {
				console.log(succ("Offering IP to", m.xid));	
			}
			
			resp.close();
		});

		
	}
	
});

dhcp_server.on('listening', function(address) {
	console.log('listening on ' + address);
});

tftp_server.on("error", function (error){
	//Errors from the main socket 
	//The current transfers are not aborted 
	console.error (error);
});
 
tftp_server.on("request", function (req, res){
	req.on ("error", function (error){
		//Error from the request 
		//The connection is already closed 
		console.error ("[" + req.stats.remoteAddress + ":" + req.stats.remotePort +	"] (" + req.file + ") " + error.message);
	});
});

// tftp_server.listen();
dhcp_server.bind();

console.log(succ("Servers binded"));

setTimeout(function() {
	exec("vboxmanage controlvm 'PXETest' reset", {"uid": 501});
	console.log(succ("Resetting VM"));

}, 2000);