import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # Hash da senha da conta (bcrypt). O login exige nick + senha + passkey do dispositivo.
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Pontos de experiência acumulados — o nível é derivado do XP
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Tempo ativo total no site (segundos) — alimenta conquistas de tempo
    total_time_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # País de origem escolhido no cadastro (nome legível, ex: "Brasil")
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Endereço IP do último acesso (usado pelo admin para bans por IP)
    last_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Conta banida por um admin (banned): bloqueia login e ações logadas
    is_banned: Mapped[bool] = mapped_column(default=False, nullable=False)
    # Marcação direta de admin no banco (além da env ADMIN_NICKS). Permite
    # promover um usuário a administrador sem depender de variável de ambiente.
    is_admin: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Relacionamento de Autenticação (Múltiplas Passkeys por usuário)
    passkeys: Mapped[List["Passkey"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    # Relacionamentos de Progresso (Centralizados no PostgreSQL)
    achievements: Mapped[List["Achievement"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    favorites: Mapped[List["Favorite"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    discoveries: Mapped[List["Discovery"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    settings: Mapped[Optional["UserSettings"]] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    chat_messages: Mapped[List["ChatMessage"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Passkey(Base):
    __tablename__ = "passkeys"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # Identificador único da credencial (Base64URL)
    credential_id: Mapped[str] = mapped_column(String(512), unique=True, index=True, nullable=False)
    # Chave pública em formato bytes (COSE)
    public_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    # Contador de assinaturas para prevenção de clonagem/replay
    sign_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Transports suportados: ['internal', 'hybrid', 'usb', 'ble', 'nfc']
    transports: Mapped[list] = mapped_column(JSON, default=list)
    # Nome amigável do dispositivo (ex: "MacBook Pro", "iPhone 15")
    device_name: Mapped[str] = mapped_column(String(100), default="Dispositivo Desconhecido")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="passkeys")


# --- TABELAS DE PROGRESSO ---

class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="achievements")


class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    item_type: Mapped[str] = mapped_column(String(50))
    item_id: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="favorites")


class Discovery(Base):
    __tablename__ = "discoveries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    species_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # Reino da espécie (animalia, plantae, fungi, protozoa, chromista, etc.)
    kingdom: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="discoveries")


class UserSettings(Base):
    __tablename__ = "settings"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme: Mapped[str] = mapped_column(String(20), default="dark")
    notifications_enabled: Mapped[bool] = mapped_column(default=True)

    user: Mapped["User"] = relationship(back_populates="settings")


# Ban por IP: o IP não pode criar conta nem fazer login (mas pode usar o site anônimo).
class IpBan(Base):
    __tablename__ = "ip_bans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ip: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    banned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# Visualizações únicas do site: um registro por dispositivo (browser).
# O dispositivo é identificado por um id persistente gerado no cliente;
# o IP de origem fica apenas como referência informativa.
class SiteView(Base):
    __tablename__ = "site_views"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    first_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


# Mensagens do chat (global = todos; local = quem estiver geograficamente perto).
class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(10), default="global", index=True)
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    # Dados de localização derivados do IP no momento do envio (usados no chat local).
    ip: Mapped[str] = mapped_column(String(64), index=True)
    country_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    user: Mapped[Optional["User"]] = relationship(back_populates="chat_messages")


# Alerta para o admin quando uma mensagem ofensiva é bloqueada.
class ChatReport(Base):
    __tablename__ = "chat_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    content_attempted: Mapped[str] = mapped_column(String(500), nullable=False)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    resolved: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[Optional["User"]] = relationship()
