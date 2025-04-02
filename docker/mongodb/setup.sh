#!/bin/bash

echo "Waiting for MongoDB to start..."
until mongosh --host mongodb:27017 --eval "print('MongoDB is up')" > /dev/null 2>&1; do
  sleep 2
done

echo "MongoDB started, initializing replica set..."

mongosh --host mongodb:27017 <<EOF
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongodb:27017" }
  ]
});
EOF

echo "Waiting for replica set to initialize..."
sleep 5

mongosh --host mongodb:27017 --eval "rs.status()"

echo "MongoDB replica set initialized successfully"