#!/bin/bash

# Stress test script for the NXTPeer API
# Usage: ./stress-test.sh [num_requests] [concurrency] [delay_ms]

# Default parameters
NUM_REQUESTS=${1:-100}      # Total number of requests to send
CONCURRENCY=${2:-10}        # How many concurrent requests to run
DELAY_MS=${3:-100}          # Delay between batches in milliseconds
API_URL="http://localhost:3001/evaluate/git/1"
REPO_URL="https://github.com/w2wizard/readme"
BRANCH="master"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Stress Test Configuration:${NC}"
echo -e "  Total Requests: ${GREEN}$NUM_REQUESTS${NC}"
echo -e "  Concurrency: ${GREEN}$CONCURRENCY${NC}"
echo -e "  Delay between batches: ${GREEN}${DELAY_MS}ms${NC}"
echo -e "  API URL: ${GREEN}$API_URL${NC}"
echo -e "  Repository: ${GREEN}$REPO_URL${NC}"
echo -e "  Branch: ${GREEN}$BRANCH${NC}"
echo ""

# Stats variables
successful_requests=0
failed_requests=0
total_time=0
min_time=9999
max_time=0

# Function to send a single request and measure time
send_request() {
    local start_time=$(date +%s.%N)

    local response=$(curl --silent --write-out "\n%{http_code}" --location "$API_URL" \
        --form "remote=$REPO_URL" \
        --form "branch=$BRANCH")

    local end_time=$(date +%s.%N)
    local status_code=$(echo "$response" | tail -n1)
    local time_taken=$(echo "$end_time - $start_time" | bc)

    echo "$time_taken $status_code"
}

echo -e "${YELLOW}Starting stress test...${NC}"
start_total=$(date +%s.%N)

# Run the requests in batches of CONCURRENCY
for ((i = 1; i <= NUM_REQUESTS; i += CONCURRENCY)); do
    batch_size=$((i + CONCURRENCY - 1 > NUM_REQUESTS ? NUM_REQUESTS - i + 1 : CONCURRENCY))

    echo -e "${YELLOW}Sending batch of ${batch_size} requests (${i}-$((i + batch_size - 1))/${NUM_REQUESTS})${NC}"

    # Run the batch of requests in parallel and capture results
    results=()
    for ((j = 0; j < batch_size; j++)); do
        send_request &
        pids[$j]=$!
    done

    # Wait for all processes to finish and collect results
    for ((j = 0; j < batch_size; j++)); do
        wait ${pids[$j]}
        results[$j]=$?
    done

    # Process the results
    for result in "${results[@]}"; do
        if [[ $result == 0 ]]; then
            ((successful_requests++))
        else
            ((failed_requests++))
        fi
    done

    # Sleep for the specified delay between batches
    if [ $i -lt $NUM_REQUESTS ]; then
        sleep $(echo "scale=3; $DELAY_MS/1000" | bc)
    fi
done

end_total=$(date +%s.%N)
total_duration=$(echo "$end_total - $start_total" | bc)

# Print results
echo -e "\n${BLUE}Test completed!${NC}"
echo -e "  Total time: ${GREEN}$(printf "%.2f" $total_duration) seconds${NC}"
echo -e "  Successful requests: ${GREEN}$successful_requests${NC}"
echo -e "  Failed requests: ${RED}$failed_requests${NC}"
echo -e "  Requests per second: ${GREEN}$(printf "%.2f" $(echo "$NUM_REQUESTS/$total_duration" | bc -l))${NC}"

# Write results to file
echo "Stress Test Results ($(date))" > stress_test_results.txt
echo "Total requests: $NUM_REQUESTS" >> stress_test_results.txt
echo "Concurrency: $CONCURRENCY" >> stress_test_results.txt
echo "Delay between batches: ${DELAY_MS}ms" >> stress_test_results.txt
echo "Total time: $(printf "%.2f" $total_duration) seconds" >> stress_test_results.txt
echo "Successful requests: $successful_requests" >> stress_test_results.txt
echo "Failed requests: $failed_requests" >> stress_test_results.txt
echo "Requests per second: $(printf "%.2f" $(echo "$NUM_REQUESTS/$total_duration" | bc -l))" >> stress_test_results.txt

echo -e "\n${GREEN}Results saved to stress_test_results.txt${NC}"
