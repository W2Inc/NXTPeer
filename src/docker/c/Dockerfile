FROM gcc AS build-env
COPY . /app
WORKDIR /app
RUN cc "$SRC_FILE" -o hello

FROM gcr.io/distroless/cc
# COPY --from=build-env /app /app
# WORKDIR /app
CMD ["cc"]
