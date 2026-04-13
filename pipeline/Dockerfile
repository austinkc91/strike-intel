FROM ghcr.io/osgeo/gdal:ubuntu-full-3.9.0

RUN apt-get update && apt-get install -y \
    build-essential \
    libsqlite3-dev \
    zlib1g-dev \
    python3-pip \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install tippecanoe
RUN git clone https://github.com/felt/tippecanoe.git /tmp/tippecanoe \
    && cd /tmp/tippecanoe \
    && make -j$(nproc) \
    && make install \
    && rm -rf /tmp/tippecanoe

RUN pip3 install --break-system-packages pyyaml

WORKDIR /pipeline
COPY . /pipeline/

ENTRYPOINT ["bash", "/pipeline/process.sh"]
