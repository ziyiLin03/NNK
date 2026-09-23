from django.urls import path
from .views import (
    ReportGroupMembersView, ReportListView, ReportDetailView, ReportCreateView,
    UserCreateView, DataExportView,
    UserListView, UserUpdateView, UserDeleteView, StatsView,
    MyReportsListView, MyReportDetailView, 
    upload_photo, upload_audio, delete_audio, delete_photo,
    global_chat_messages, send_global_message,
    private_chat_messages, send_private_message,
    list_users_for_chat, list_my_conversations,
    # Nuevas vistas de grupos y ocultar chats importadas correctamente:
    create_group_chat, delete_or_leave_group, group_chat_messages, send_group_message, hide_private_conversation
)
from .auth import LoginView, logout_view, verify_token_view, RefreshView, ChangePasswordView, me_view

urlpatterns = [

    # ── Reports ───────────────────────────────────────────────────────────────
    path('reports/',                ReportListView.as_view()),
    path('reports/create/',         ReportCreateView.as_view()),
    path('reports/<int:pk>/',       ReportDetailView.as_view()),
    path('my-reports/',             MyReportsListView.as_view(),  name='my-reports'),
    path('my-reports/<int:pk>/',    MyReportDetailView.as_view(), name='my-report-detail'),
    path('reports/group/<str:group_id>/', ReportGroupMembersView.as_view()),

    # ── Auth ──────────────────────────────────────────────────────────────────
    path('auth/login/',    LoginView.as_view(),  name='login'),
    path('auth/logout/',   logout_view),
    path('auth/me/',       me_view,              name='me'),
    path('auth/verify/',   verify_token_view),
    path('auth/refresh/',  RefreshView.as_view()),

    # ── Users (admin only) ────────────────────────────────────────────────────
    path('users/',                  UserListView.as_view()),
    path('users/create/',           UserCreateView.as_view()),
    path('users/<int:pk>/update/',  UserUpdateView.as_view()),
    path('users/<int:pk>/delete/',  UserDeleteView.as_view()),

    # ── Data & stats ──────────────────────────────────────────────────────────
    path('data-export/', DataExportView.as_view()),
    path('stats/',        StatsView.as_view()),

    # ── Media uploads ─────────────────────────────────────────────────────────
    path('upload-photo/', upload_photo, name='upload-photo'),
    path('delete-photo/', delete_photo, name='delete-photo'),
    path('upload-audio/', upload_audio, name='upload-audio'),
    path('delete-audio/', delete_audio, name='delete-audio'),

    # ── Chat ──────────────────────────────────────────────────────────────────
    # These are served under /api/ prefix from the root urls.py
    # so full URLs become: /api/chat/global/, /api/chat/users/, etc.
    path('chat/global/',                      global_chat_messages,  name='chat-global'),
    path('chat/global/send/',                 send_global_message,   name='chat-global-send'),
    path('chat/private/<int:user_id>/',       private_chat_messages, name='chat-private'),
    path('chat/private/<int:user_id>/send/',  send_private_message,  name='chat-private-send'),
    path('chat/users/',                       list_users_for_chat,   name='chat-users'),
    path('chat/conversations/',               list_my_conversations, name='chat-conversations'),
    path('chat/conversations/<int:room_id>/', hide_private_conversation, name='hide_private_conversation'),

    # ── Grupos (Corregido para coincidir con tu chat.js) ───────────────────────
    path('chat/groups/create/',               create_group_chat,     name='create_group_chat'),

# 🚨 LE QUITAMOS LA 's' A ESTAS TRES RUTAS:
    path('chat/group/<int:group_id>/',        group_chat_messages,   name='group_chat_messages'),
    path('chat/group/<int:group_id>/send/',   send_group_message,    name='send_group_message'),
    path('chat/group/<int:group_id>/delete/', delete_or_leave_group, name='delete_or_leave_group'),
]