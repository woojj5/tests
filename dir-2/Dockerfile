FROM node:18-alpine
WORKDIR /app

# 패키지 먼저 복사 후 설치(캐시 효율)
COPY package*.json ./
# package-lock.json 있으면 ci, 없으면 install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 소스 복사
COPY . .

# 누락 의존성(에러에 나온 swr, supabase) 빌드타임에 보정
# -> package.json에 이미 추가했다면 이 줄 삭제해도 됨
RUN npm install swr @supabase/supabase-js --save

# 프로덕션 빌드
RUN npm run build

EXPOSE 3006
CMD ["npm", "start"]
