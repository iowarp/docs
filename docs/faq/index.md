# FAQ & Troubleshooting

## Could not start TCP server on any host from hostfile?

The following error comes up when there is another application using the port
chimaera is trying to attach to:
```bash
chimaera_start_runtime
/workspace/src/ipc_manager.cc:673 ERROR 746682 IdentifyThisHost ERROR: Could not start TCP server on any host from hostfile
/workspace/src/ipc_manager.cc:674 ERROR 746682 IdentifyThisHost Port attempted: 9128
/workspace/src/ipc_manager.cc:675 ERROR 746682 IdentifyThisHost Hosts checked (1 total):
/workspace/src/ipc_manager.cc:677 ERROR 746682 IdentifyThisHost   - 127.0.0.1
/workspace/src/ipc_manager.cc:679 ERROR 746682 IdentifyThisHost 
/workspace/src/ipc_manager.cc:680 ERROR 746682 IdentifyThisHost This usually means another process is already running on the same port
/workspace/src/ipc_manager.cc:683 ERROR 746682 IdentifyThisHost 
/workspace/src/ipc_manager.cc:684 ERROR 746682 IdentifyThisHost To check which process is using port 9128, run:
/workspace/src/ipc_manager.cc:685 ERROR 746682 IdentifyThisHost   Linux:   sudo lsof -i :9128 -P -n
/workspace/src/ipc_manager.cc:686 ERROR 746682 IdentifyThisHost            sudo netstat -tulpn | grep :9128
/workspace/src/ipc_manager.cc:687 ERROR 746682 IdentifyThisHost   macOS:   sudo lsof -i :9128 -P -n
/workspace/src/ipc_manager.cc:688 ERROR 746682 IdentifyThisHost            sudo lsof -nP -iTCP:9128 | grep LISTEN
/workspace/src/ipc_manager.cc:689 ERROR 746682 IdentifyThisHost 
/workspace/src/ipc_manager.cc:690 ERROR 746682 IdentifyThisHost To stop the Chimaera runtime, run:
/workspace/src/ipc_manager.cc:691 ERROR 746682 IdentifyThisHost   chimaera_stop_runtime
/workspace/src/ipc_manager.cc:692 ERROR 746682 IdentifyThisHost 
/workspace/src/ipc_manager.cc:693 ERROR 746682 IdentifyThisHost Or kill the process directly:
/workspace/src/ipc_manager.cc:694 ERROR 746682 IdentifyThisHost   pkill -9 chimaera_start_runtime
/workspace/src/ipc_manager.cc:695 FATAL 746682 IdentifyThisHost   kill -9 <PID>
```

This is most common in the distributed cases when using ssh or pssh to call ``pkill chimaera_*``.
I suspect this has a chance to kill the ssh connection before the runtime itself. Specify the
full executable name and don't use wildcard for best results.
