# api/filters.py
import django_filters
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q
from core.models import FieldReport, ReportPosition

class FieldReportFilter(django_filters.FilterSet):

    # ─── GENERAL ──────────────────────────────────────────────────────────────
    interview_type = django_filters.CharFilter(field_name='interviewType', lookup_expr='iexact')
    min_people     = django_filters.NumberFilter(field_name='people_count', lookup_expr='gte')
    max_people     = django_filters.NumberFilter(field_name='people_count', lookup_expr='lte')
    timezone       = django_filters.CharFilter(field_name='timezone', lookup_expr='iexact')
    placement      = django_filters.CharFilter(method='filter_by_placement')
    fecha_desde    = django_filters.DateTimeFilter(field_name='timestamp', lookup_expr='gte')
    fecha_hasta    = django_filters.DateTimeFilter(field_name='timestamp', lookup_expr='lte')
    days           = django_filters.NumberFilter(method='filter_by_days')
    volunteer      = django_filters.CharFilter(field_name='submitted_by__username', lookup_expr='icontains')
    needs          = django_filters.CharFilter(field_name='needs', lookup_expr='icontains')

    # ─── MAP ──────────────────────────────────────────────────────────────────
    has_map               = django_filters.BooleanFilter(method='filter_has_map')
    min_points            = django_filters.NumberFilter(method='filter_min_points')
    min_current           = django_filters.NumberFilter(method='filter_cat_current')
    min_mafia             = django_filters.NumberFilter(method='filter_cat_mafia')
    min_police            = django_filters.NumberFilter(method='filter_cat_police')
    min_pushback          = django_filters.NumberFilter(method='filter_cat_pushback')
    min_safe              = django_filters.NumberFilter(method='filter_cat_safe')
    min_violence          = django_filters.NumberFilter(method='filter_cat_violence')
    min_robbery           = django_filters.NumberFilter(method='filter_cat_robbery')
    min_extortion         = django_filters.NumberFilter(method='filter_cat_extortion')
    min_medical           = django_filters.NumberFilter(method='filter_cat_medical')
    min_refuge            = django_filters.NumberFilter(method='filter_cat_refuge')
    min_food              = django_filters.NumberFilter(method='filter_cat_food')
    country               = django_filters.CharFilter(method='filter_by_country')
    has_point_description = django_filters.BooleanFilter(method='filter_has_point_description')
    has_point_date        = django_filters.BooleanFilter(method='filter_has_point_date')

    # ─── OPERADORES DINÁMICOS (is / more than / less than) ────────────────────
    # Uso: ?age=25&age_operator=is  |  ?age=18&age_operator=more_than
    age            = django_filters.NumberFilter(method='filter_age')
    age_operator   = django_filters.CharFilter(method='noop')

    health         = django_filters.NumberFilter(method='filter_health')
    health_operator = django_filters.CharFilter(method='noop')

    points_count          = django_filters.NumberFilter(method='filter_points_count')
    points_count_operator = django_filters.CharFilter(method='noop')

    # Por categoría con operador: ?mafia=2&mafia_operator=more_than
    current_count           = django_filters.NumberFilter(method='filter_current_count')
    current_count_operator  = django_filters.CharFilter(method='noop')
    mafia_count             = django_filters.NumberFilter(method='filter_mafia_count')
    mafia_count_operator    = django_filters.CharFilter(method='noop')
    police_count            = django_filters.NumberFilter(method='filter_police_count')
    police_count_operator   = django_filters.CharFilter(method='noop')
    pushback_count          = django_filters.NumberFilter(method='filter_pushback_count')
    pushback_count_operator = django_filters.CharFilter(method='noop')
    safe_count              = django_filters.NumberFilter(method='filter_safe_count')
    safe_count_operator     = django_filters.CharFilter(method='noop')
    violence_count          = django_filters.NumberFilter(method='filter_violence_count')
    violence_count_operator = django_filters.CharFilter(method='noop')
    robbery_count           = django_filters.NumberFilter(method='filter_robbery_count')
    robbery_count_operator  = django_filters.CharFilter(method='noop')
    extortion_count         = django_filters.NumberFilter(method='filter_extortion_count')
    extortion_count_operator = django_filters.CharFilter(method='noop')
    medical_count           = django_filters.NumberFilter(method='filter_medical_count')
    medical_count_operator  = django_filters.CharFilter(method='noop')
    refuge_count            = django_filters.NumberFilter(method='filter_refuge_count')
    refuge_count_operator   = django_filters.CharFilter(method='noop')
    food_count              = django_filters.NumberFilter(method='filter_food_count')
    food_count_operator     = django_filters.CharFilter(method='noop')

    # ─── MANUAL ───────────────────────────────────────────────────────────────
    has_manual = django_filters.BooleanFilter(method='filter_has_manual')
    gender     = django_filters.CharFilter(field_name='gender', lookup_expr='iexact')
    min_age    = django_filters.NumberFilter(field_name='age', lookup_expr='gte')
    max_age    = django_filters.NumberFilter(field_name='age', lookup_expr='lte')
    min_health = django_filters.NumberFilter(field_name='general_health', lookup_expr='gte')
    max_health = django_filters.NumberFilter(field_name='general_health', lookup_expr='lte')

    # ─── AUDIO / PHOTO ────────────────────────────────────────────────────────
    has_audio  = django_filters.BooleanFilter(method='filter_has_audio')
    has_photo  = django_filters.BooleanFilter(method='filter_has_photo')
    min_audios = django_filters.NumberFilter(method='filter_min_audios')
    min_photos = django_filters.NumberFilter(method='filter_min_photos')

    # ─── HELPER: operador dinámico ────────────────────────────────────────────

    def _apply_operator(self, queryset, field, value, operator):
        """Traduce is/more_than/less_than a lookup de Django."""
        op_map = {
            'is':        'exact',
            'more_than': 'gt',
            'less_than': 'lt',
            'gte':       'gte',
            'lte':       'lte',
        }
        lookup = op_map.get(operator, 'exact')
        return queryset.filter(**{f'{field}__{lookup}': value})

    def _apply_cat_operator(self, queryset, value, operator, category):
        op_map = {
            'is':        'exact',
            'more_than': 'gt',
            'less_than': 'lt',
        }
        lookup = op_map.get(operator, 'gte')
        return queryset.annotate(
            cat_count=Count('positions', filter=Q(positions__category=category))
        ).filter(**{f'cat_count__{lookup}': value})

    def noop(self, queryset, name, value):
        """Filtro vacío — el operador se lee en el filtro del valor."""
        return queryset

    # ─── MÉTODOS DE OPERADORES DINÁMICOS ─────────────────────────────────────

    def filter_age(self, queryset, name, value):
        operator = self.data.get('age_operator', 'is')
        return self._apply_operator(queryset, 'age', value, operator)

    def filter_health(self, queryset, name, value):
        operator = self.data.get('health_operator', 'is')
        return self._apply_operator(queryset, 'general_health', value, operator)

    def filter_points_count(self, queryset, name, value):
        operator = self.data.get('points_count_operator', 'is')
        op_map = {'is': 'exact', 'more_than': 'gt', 'less_than': 'lt'}
        lookup = op_map.get(operator, 'exact')
        return queryset.annotate(
            num_points=Count('positions')
        ).filter(**{f'num_points__{lookup}': value})

    def filter_current_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('current_count_operator', 'is'), 'actual')

    def filter_mafia_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('mafia_count_operator', 'is'), 'mafia')

    def filter_police_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('police_count_operator', 'is'), 'police')

    def filter_pushback_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('pushback_count_operator', 'is'), 'pushback')

    def filter_safe_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('safe_count_operator', 'is'), 'safe_point')

    def filter_violence_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('violence_count_operator', 'is'), 'violence')

    def filter_robbery_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('robbery_count_operator', 'is'), 'robbery')

    def filter_extortion_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('extortion_count_operator', 'is'), 'extortion')

    def filter_medical_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('medical_count_operator', 'is'), 'medical')

    def filter_refuge_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('refuge_count_operator', 'is'), 'shelter')

    def filter_food_count(self, queryset, name, value):
        return self._apply_cat_operator(queryset, value, self.data.get('food_count_operator', 'is'), 'food')

    # ─── MÉTODOS ESTÁNDAR ─────────────────────────────────────────────────────

    def filter_by_days(self, queryset, name, value):
        since = timezone.now() - timedelta(days=int(value))
        return queryset.filter(timestamp__gte=since)

    def filter_by_placement(self, queryset, name, value):
        return queryset.filter(
            positions__location_name__icontains=value,
            positions__order=0
        ).distinct()

    def filter_has_map(self, queryset, name, value):
        if value:
            return queryset.filter(positions__isnull=False).distinct()
        return queryset.filter(positions__isnull=True)

    def filter_min_points(self, queryset, name, value):
        return queryset.annotate(num_points=Count('positions')).filter(num_points__gte=value)

    def _filter_by_category(self, queryset, value, category):
        return queryset.annotate(
            cat_count=Count('positions', filter=Q(positions__category=category))
        ).filter(cat_count__gte=value)

    def filter_cat_current(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'actual')

    def filter_cat_mafia(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'mafia')

    def filter_cat_police(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'police')

    def filter_cat_pushback(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'pushback')

    def filter_cat_safe(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'safe_point')

    def filter_cat_violence(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'violence')

    def filter_cat_robbery(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'robbery')

    def filter_cat_extortion(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'extortion')

    def filter_cat_medical(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'medical')

    def filter_cat_refuge(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'shelter')

    def filter_cat_food(self, queryset, name, value):
        return self._filter_by_category(queryset, value, 'food')

    def filter_by_country(self, queryset, name, value):
        # Soporta múltiples países separados por coma: ?country=Spain,UK,Morocco
        countries = [c.strip() for c in value.split(',') if c.strip()]
        q = Q()
        for c in countries:
            q |= Q(positions_location_name_icontains=c)
        return queryset.filter(q).distinct()

    def filter_has_point_description(self, queryset, name, value):
        if value:
            return queryset.filter(
                positions__description__isnull=False
            ).exclude(positions__description='').distinct()
        return queryset.exclude(positions__description__isnull=False).distinct()

    def filter_has_point_date(self, queryset, name, value):
        if value:
            return queryset.filter(positions__passed_at__isnull=False).distinct()
        return queryset.filter(positions__passed_at__isnull=True).distinct()

    def filter_has_manual(self, queryset, name, value):
        if value:
            return queryset.filter(
                Q(needs__isnull=False) | Q(notes__isnull=False)
            ).exclude(needs='').exclude(notes='')
        return queryset.filter(needs__isnull=True, notes__isnull=True)

    def filter_has_audio(self, queryset, name, value):
        if value:
            return queryset.exclude(audio_file__isnull=True).exclude(audio_file='')
        return queryset.filter(Q(audio_file__isnull=True) | Q(audio_file=''))

    def filter_has_photo(self, queryset, name, value):
        if value:
            return queryset.exclude(photo_file__isnull=True).exclude(photo_file='')
        return queryset.filter(Q(photo_file__isnull=True) | Q(photo_file=''))

    def filter_min_audios(self, queryset, name, value):
        if int(value) >= 1:
            return queryset.exclude(audio_file__isnull=True).exclude(audio_file='')
        return queryset

    def filter_min_photos(self, queryset, name, value):
        if int(value) >= 1:
            return queryset.exclude(photo_file__isnull=True).exclude(photo_file='')
        return queryset

    class Meta:
        model  = FieldReport
        fields = []